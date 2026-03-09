import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeAgentRun }   from '@/lib/agent-runner'
import type { RunEvent }     from '@/lib/agent-runner'
import type { Agent, AgentRun } from '@/lib/types'

export const runtime = 'nodejs'

// ── GET /api/agents/runs/[runId]/stream ───────────────────────────────────────
// SSE endpoint — streams agent execution in real time

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } }
) {
  const supabase   = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return new Response('Unauthorised', { status: 401 })
  }
  if (!activeGroupId) {
    return new Response('No active group', { status: 400 })
  }

  // Load run + verify access
  const { data: run } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('id', params.runId)
    .eq('group_id', activeGroupId)
    .single()

  if (!run) return new Response('Run not found', { status: 404 })

  // If already completed, stream the saved output
  const runData = run as AgentRun
  if (runData.status === 'success' || runData.status === 'error' || runData.status === 'cancelled') {
    const encoder = new TextEncoder()
    const stream  = new ReadableStream({
      start(controller) {
        if (runData.status === 'success' && runData.output) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: runData.output })}\n\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', tokens: runData.tokens_used ?? 0 })}\n\n`))
        } else if (runData.status === 'error') {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: runData.error_message ?? 'Unknown error' })}\n\n`))
        }
        controller.close()
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

  // Load agent for this run
  const admin = createAdminClient()
  const { data: agent } = await admin
    .from('agents')
    .select('*')
    .eq('id', runData.agent_id)
    .single()

  if (!agent) return new Response('Agent not found', { status: 404 })

  // Load group name
  const { data: group } = await admin
    .from('groups')
    .select('name')
    .eq('id', activeGroupId)
    .single()

  const groupName = (group as { name: string } | null)?.name ?? 'Your Group'

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: RunEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Client disconnected
        }
      }

      try {
        await executeAgentRun(
          params.runId,
          agent as Agent,
          runData.input_context as Parameters<typeof executeAgentRun>[2],
          groupName,
          send
        )
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        controller.close()
      }
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
