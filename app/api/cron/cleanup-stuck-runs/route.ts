import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime     = 'nodejs'
export const maxDuration = 30

// ── GET /api/cron/cleanup-stuck-runs ─────────────────────────────────────────
// Marks any agent_run stuck in queued / running / cancelling for more than
// 30 minutes as failed. Backstop for runs whose serverless invocation died
// before finishing — without this, runs sit forever and clutter the UI.
//
// Authorised via the same `Authorization: Bearer ${CRON_SECRET}` header used
// by /api/cron/xero-sync and /api/cron/scheduled-agents.

export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== expected) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin  = createAdminClient()
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  // We compare both started_at AND created_at — queued runs may never have
  // received a started_at if executeAgentRun never reached the update.
  const { data: stuck, error } = await admin
    .from('agent_runs')
    .select('id, run_name, status, started_at, created_at')
    .in('status', ['queued', 'running', 'cancelling'])
    .or(`started_at.lt.${cutoff},and(started_at.is.null,created_at.lt.${cutoff})`)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const stuckIds = (stuck ?? []).map(r => (r as { id: string }).id)
  if (stuckIds.length === 0) {
    return NextResponse.json({ cleaned: 0 })
  }

  const { error: updateErr } = await admin
    .from('agent_runs')
    .update({
      status:        'error',
      error_message: 'Run timed out — server process was interrupted. Please try again.',
      completed_at:  new Date().toISOString(),
    })
    .in('id', stuckIds)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  console.log(`[cleanup-stuck-runs] Marked ${stuckIds.length} stuck runs as error`)
  return NextResponse.json({ cleaned: stuckIds.length, run_ids: stuckIds })
}
