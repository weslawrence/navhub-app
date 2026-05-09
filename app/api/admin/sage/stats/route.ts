import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

// ── GET /api/admin/sage/stats ────────────────────────────────────────────────
// Summary for the admin home Sage panel:
//   • last completed scan + summary
//   • counts of new findings by severity
export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  const [{ data: lastScanRow }, { data: openFindings }] = await Promise.all([
    admin.from('sage_scans')
      .select('id, scan_type, summary, started_at, completed_at, findings_count, critical_count, status')
      .eq('status', 'complete')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('sage_findings')
      .select('severity')
      .in('status', ['new', 'acknowledged', 'acting']),
  ])

  const counts = { critical: 0, warning: 0, info: 0, positive: 0 }
  for (const f of (openFindings ?? []) as Array<{ severity: keyof typeof counts }>) {
    if (f.severity in counts) counts[f.severity] += 1
  }

  return NextResponse.json({
    data: {
      last_scan: lastScanRow ?? null,
      counts,
    },
  })
}
