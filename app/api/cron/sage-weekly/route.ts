import { NextResponse } from 'next/server'
import { runSageScan }  from '@/lib/sage-runner'

export const runtime     = 'nodejs'
export const maxDuration = 300

// ── GET /api/cron/sage-weekly ────────────────────────────────────────────────
// Weekly comprehensive platform digest. Triggered by the Vercel cron at
// Sunday 23:00 UTC (Monday 9 am AEST). Looks back 7 days.
export async function GET(request: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== expected) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  try {
    const scanId = await runSageScan('weekly', null, 7)
    return NextResponse.json({ ok: true, scan_id: scanId })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
