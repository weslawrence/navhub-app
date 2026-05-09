import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runSageScan }       from '@/lib/sage-runner'
import type { SageScanType } from '@/lib/types'

export const runtime     = 'nodejs'
export const maxDuration = 300

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

// ── POST /api/admin/sage/scan ────────────────────────────────────────────────
// Triggers an adhoc Sage scan inside the request lambda. Up to 300 s budget;
// suitable for adhoc/requested scans. The scan record is created up-front so
// the UI can navigate to /admin/sage immediately even if execution overruns
// the lambda — cleanup on stuck scans is handled by the next weekly run.
//
// Body: { scan_type?: 'adhoc' | 'requested', focus_area?: string, period_days?: number }
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { /* defaults */ }

  const scanType: SageScanType = body.scan_type === 'requested' ? 'requested' : 'adhoc'
  const focusArea  = typeof body.focus_area  === 'string' ? body.focus_area.trim() : null
  const periodDays = typeof body.period_days === 'number' && body.period_days > 0
    ? Math.min(Math.floor(body.period_days), 90)
    : 7

  try {
    const scanId = await runSageScan(scanType, session.user.id, periodDays, focusArea ?? undefined)
    return NextResponse.json({ data: { scan_id: scanId } }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
