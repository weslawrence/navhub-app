import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeAgentRun }   from '@/lib/agent-runner'
import type { RunContext }   from '@/lib/agent-runner'
import type { Agent }        from '@/lib/types'

export const runtime     = 'nodejs'
export const maxDuration = 300

// ─── GET /api/cron/process-queued-runs ───────────────────────────────────────
// Vercel cron (every minute). Picks the OLDEST queued agent_run and executes
// it inside the cron's lambda — the lambda that creates the run from
// /api/agents/[id]/run can no longer reliably do this itself because Vercel
// Pro kills lambdas at 300 s and a void-IIFE running past the response is
// reaped on most invocations.
//
// Race condition guard: the UPDATE that flips status queued → running is
// gated on `.eq('status', 'queued')`. Two concurrent cron invocations
// trying to claim the same row will see one succeed and the other return
// zero rows — at which point the loser silently picks another row on the
// next minute.
//
// Stuck-run safety net: /api/cron/cleanup-stuck-runs runs every 30 min and
// marks any run sitting in running / cancelling / queued for >30 min as
// 'error'. So a run whose lambda gets killed mid-execution doesn't sit
// forever.

export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== expected) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Pick a SMALL batch of the oldest queued runs. Two per minute keeps
  // wall-clock parallelism low so we don't trip provider rate limits.
  const { data: queuedRuns, error: queuedErr } = await admin
    .from('agent_runs')
    .select('id, agent_id, group_id, input_context')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(2)

  if (queuedErr) {
    return NextResponse.json({ error: queuedErr.message }, { status: 500 })
  }
  if (!queuedRuns || queuedRuns.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  const results: Array<{ run_id: string; status: string; error?: string }> = []

  for (const run of queuedRuns) {
    const runId = (run as { id: string }).id
    try {
      // ── Race-guarded claim ───────────────────────────────────────────────
      // Only one cron invocation can flip queued → running. Concurrent
      // invocations attempting the same row will see `data` empty and skip.
      const { data: claimed } = await admin
        .from('agent_runs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', runId)
        .eq('status', 'queued')
        .select('id')
      if (!claimed || claimed.length === 0) {
        results.push({ run_id: runId, status: 'skipped' })
        continue
      }

      // ── Load agent + group name ────────────────────────────────────────
      const { data: agent } = await admin
        .from('agents')
        .select('*')
        .eq('id', (run as { agent_id: string }).agent_id)
        .single()
      const { data: group } = await admin
        .from('groups')
        .select('name')
        .eq('id', (run as { group_id: string }).group_id)
        .single()

      if (!agent) {
        await admin
          .from('agent_runs')
          .update({
            status:        'error',
            error_message: 'Agent record not found at execution time',
            completed_at:  new Date().toISOString(),
          })
          .eq('id', runId)
        results.push({ run_id: runId, status: 'error', error: 'agent_not_found' })
        continue
      }

      const groupName = (group as { name: string } | null)?.name ?? 'Your Group'
      const ctx       = ((run as { input_context: RunContext | null }).input_context
                          ?? {}) as RunContext

      try {
        await executeAgentRun(
          runId,
          agent as Agent,
          ctx,
          groupName,
          () => { /* background — onChunk no-op; output is persisted to DB */ },
        )
        results.push({ run_id: runId, status: 'completed' })
      } catch (err) {
        await admin
          .from('agent_runs')
          .update({
            status:        'error',
            error_message: err instanceof Error ? err.message : String(err),
            completed_at:  new Date().toISOString(),
          })
          .eq('id', runId)
        results.push({ run_id: runId, status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    } catch (err) {
      console.error(`[process-queued-runs] Run ${runId} failed:`, err)
      results.push({ run_id: runId, status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
