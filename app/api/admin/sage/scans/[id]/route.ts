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

// ── GET /api/admin/sage/scans/[id] ───────────────────────────────────────────
// Returns the scan record + all its findings.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const [{ data: scan }, { data: findings }] = await Promise.all([
    admin.from('sage_scans')   .select('*').eq('id', params.id).single(),
    admin.from('sage_findings').select('*').eq('scan_id', params.id),
  ])
  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 })

  return NextResponse.json({ data: { scan, findings: findings ?? [] } })
}
