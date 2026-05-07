import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { RunEvent }     from '@/lib/agent-runner'

export const runtime     = 'nodejs'
export const maxDuration = 300

// ── GET /api/agents/runs/[runId]/stream ───────────────────────────────────────
// SSE endpoint — observes a run that's already executing in the background
// (kicked off by POST /api/agents/[id]/run). This route NEVER invokes
// executeAgentRun itself; it just polls the DB and emits events for any
// changes the run-detail page can render.
//
// Behaviour:
//   • Replays current saved output + tool_calls on connect
//   • Polls every 2 seconds for new output deltas, new tool calls, and
//     status transitions (success | error | cancelled | awaiting_input)
//   • Closes when the run reaches a terminal state or the client aborts

const TERMINAL_STATUSES = new Set(['success', 'error', 'cancelled'])

export async function GET(
  request: Request,
  { params }: { params: { runId: string } }
) {
  const supabase    = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session)        return new Response('Unauthorised',    { status: 401 })
  if (!activeGroupId)  return new Response('No active group', { status: 400 })

  // Verify run exists and belongs to user's active group (RLS).
  const { data: ownRun } = await supabase
    .from('agent_runs')
    .select('id')
    .eq('id', params.runId)
    .eq('group_id', activeGroupId)
    .single()
  if (!ownRun) return new Response('Run not found', { status: 404 })

  const admin   = createAdminClient()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RunEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch { /* client gone */ }
      }

      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        try { controller.close() } catch { /* already closed */ }
      }

      // ── 1. Initial snapshot — replay saved output + completed tool calls ──
      const { data: initial } = await admin
        .from('agent_runs')
        .select('status, output, tool_calls, tokens_used, error_message, awaiting_input_question')
        .eq('id', params.runId)
        .single()

      if (!initial) { close(); return }

      type RunRow = {
        status:                   string
        output:                   string | null
        tool_calls:               Array<{ tool: string; input?: unknown; output?: string }> | null
        tokens_used:              number | null
        error_message:            string | null
        awaiting_input_question:  string | null
      }
      let last = initial as RunRow

      // Replay tool calls already on disk. The runner pushes a placeholder
      // row (output: '') the moment a tool starts and rewrites it with the
      // real output when the tool finishes — so we track tool_start and
      // tool_end emissions per-index separately.
      const startedIdx = new Set<number>()
      const endedIdx   = new Set<number>()
      const initialTools = Array.isArray(last.tool_calls) ? last.tool_calls : []
      for (let i = 0; i < initialTools.length; i++) {
        const tc = initialTools[i]
        send({ type: 'tool_start', tool: tc.tool as never, input: tc.input as never })
        startedIdx.add(i)
        if (tc.output && tc.output.length > 0) {
          send({ type: 'tool_end', tool: tc.tool as never, output: tc.output })
          endedIdx.add(i)
        }
      }
      let lastOutput = last.output ?? ''
      if (lastOutput) send({ type: 'text', content: lastOutput })

      // If already terminal — emit the final event and close.
      if (TERMINAL_STATUSES.has(last.status)) {
        if (last.status === 'cancelled')   send({ type: 'cancelled' })
        else if (last.status === 'error')  send({ type: 'error', message: last.error_message ?? 'Unknown error' })
        else                                send({ type: 'done',  tokens: last.tokens_used ?? 0 })
        close()
        return
      }
      if (last.status === 'awaiting_input' && last.awaiting_input_question) {
        send({ type: 'awaiting_input', question: last.awaiting_input_question, interaction_id: '' })
      }

      // ── 2. Poll for changes every 500ms — smooth enough that tool calls
      //    feel live and text output streams continuously instead of in
      //    2-second chunks. ──────────────────────────────────────────────────
      const POLL_MS = 500
      const poll = async () => {
        if (closed) return
        const { data: row } = await admin
          .from('agent_runs')
          .select('status, output, tool_calls, tokens_used, error_message, awaiting_input_question')
          .eq('id', params.runId)
          .single()
        if (closed) return
        if (!row) { close(); return }
        const r = row as RunRow

        // Output delta
        const newOutput = r.output ?? ''
        if (newOutput.length > lastOutput.length && newOutput.startsWith(lastOutput)) {
          send({ type: 'text', content: newOutput.slice(lastOutput.length) })
          lastOutput = newOutput
        } else if (newOutput.length > lastOutput.length) {
          send({ type: 'text', content: newOutput.slice(lastOutput.length) })
          lastOutput = newOutput
        }

        // Tool call deltas — emit tool_start when a new index appears, and
        // tool_end the first time we see a non-empty output for that index
        // (the runner persists '' as a placeholder when the tool starts).
        const tools = Array.isArray(r.tool_calls) ? r.tool_calls : []
        for (let i = 0; i < tools.length; i++) {
          const tc = tools[i]
          if (!startedIdx.has(i)) {
            send({ type: 'tool_start', tool: tc.tool as never, input: tc.input as never })
            startedIdx.add(i)
          }
          if (!endedIdx.has(i) && tc.output && tc.output.length > 0) {
            send({ type: 'tool_end', tool: tc.tool as never, output: tc.output })
            endedIdx.add(i)
          }
        }

        // Awaiting input — only emit on transition
        if (r.status === 'awaiting_input' && last.status !== 'awaiting_input') {
          send({ type: 'awaiting_input', question: r.awaiting_input_question ?? '', interaction_id: '' })
        }

        // Terminal status — emit final event + close
        if (TERMINAL_STATUSES.has(r.status)) {
          if (r.status === 'cancelled')   send({ type: 'cancelled' })
          else if (r.status === 'error')  send({ type: 'error', message: r.error_message ?? 'Unknown error' })
          else                            send({ type: 'done',  tokens: r.tokens_used ?? 0 })
          close()
          return
        }

        last = r
        // Tail call for next tick
        timer = setTimeout(() => { void poll() }, POLL_MS)
      }

      let timer: ReturnType<typeof setTimeout> = setTimeout(() => { void poll() }, POLL_MS)

      // Cleanup on client disconnect.
      request.signal.addEventListener('abort', () => {
        clearTimeout(timer)
        close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
