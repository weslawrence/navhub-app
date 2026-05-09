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

// ── GET /api/admin/sage/findings ─────────────────────────────────────────────
// Query params:
//   status    — comma-separated list (default: 'new,acknowledged,acting')
//   severity  — comma-separated list (optional)
//   type      — comma-separated list (optional)
//   action    — comma-separated list (optional)
//   scan_id   — restrict to a specific scan
//   limit     — default 100, max 500
export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const status   = (url.searchParams.get('status')   ?? 'new,acknowledged,acting').split(',').filter(Boolean)
  const severity = (url.searchParams.get('severity') ?? '').split(',').filter(Boolean)
  const type     = (url.searchParams.get('type')     ?? '').split(',').filter(Boolean)
  const action   = (url.searchParams.get('action')   ?? '').split(',').filter(Boolean)
  const scanId   = url.searchParams.get('scan_id')
  const limit    = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500)

  const admin = createAdminClient()
  let query = admin
    .from('sage_findings')
    .select('*')
    .order('severity', { ascending: true })   // critical < info alphabetically — re-sort below
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status.length > 0)   query = query.in('status', status)
  if (severity.length > 0) query = query.in('severity', severity)
  if (type.length > 0)     query = query.in('finding_type', type)
  if (action.length > 0)   query = query.in('action_type', action)
  if (scanId)              query = query.eq('scan_id', scanId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Severity sort: critical → warning → info → positive
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, positive: 3 }
  const sorted = (data ?? []).slice().sort((a, b) => {
    const aRank = severityOrder[(a as { severity: string }).severity] ?? 99
    const bRank = severityOrder[(b as { severity: string }).severity] ?? 99
    if (aRank !== bRank) return aRank - bRank
    return new Date((b as { created_at: string }).created_at).getTime() - new Date((a as { created_at: string }).created_at).getTime()
  })

  return NextResponse.json({ data: sorted })
}
