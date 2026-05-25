import { NextResponse }      from 'next/server'
import { runSageScan }       from '@/lib/sage-runner'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime     = 'nodejs'
export const maxDuration = 120

// ── GET /api/cron/sage-daily ─────────────────────────────────────────────────
// Lightweight daily health check. 24-hour lookback. Surfaces critical
// issues immediately via Slack alert; otherwise SKIPS the full Claude
// analysis — there's nothing to report so paying for a no-op scan and
// generating a noisy "no activity" finding every day is wasteful.
//
// Triggers a full scan only when there are stuck runs or recent errors.
export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== expected) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin       = createAdminClient()
  const errorCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const stuckCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  const [stuck, errors] = await Promise.all([
    admin.from('agent_runs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['running', 'queued', 'cancelling'])
      .lt('started_at', stuckCutoff),
    admin.from('agent_runs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['error', 'failed'])
      .gte('created_at', errorCutoff),
  ])

  const stuckCount = stuck.count  ?? 0
  const errorCount = errors.count ?? 0

  if (stuckCount === 0 && errorCount === 0) {
    console.log('[sage-daily] Platform healthy — skipping full scan')
    return NextResponse.json({
      ok:      true,
      skipped: true,
      reason:  'no stuck runs, no recent errors',
    })
  }

  console.log(`[sage-daily] Issues found (stuck: ${stuckCount}, errors: ${errorCount}) — running full scan`)
  try {
    const scanId = await runSageScan('daily', null, 1)
    return NextResponse.json({ ok: true, skipped: false, scan_id: scanId, stuck: stuckCount, errors: errorCount })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
