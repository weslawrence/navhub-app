import { NextResponse } from 'next/server'
import { runSageScan }  from '@/lib/sage-runner'

export const runtime     = 'nodejs'
export const maxDuration = 120

// ── GET /api/cron/sage-daily ─────────────────────────────────────────────────
// Lightweight daily health check. 24-hour lookback. Surfaces critical
// issues immediately via Slack alert; otherwise just records the scan.
export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== expected) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  try {
    const scanId = await runSageScan('daily', null, 1)
    return NextResponse.json({ ok: true, scan_id: scanId })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
