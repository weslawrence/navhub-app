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

// ── PATCH /api/admin/sage/findings/[id] ──────────────────────────────────────
// Body: { status?: 'new'|'acknowledged'|'acting'|'resolved'|'dismissed',
//         dismissed_reason?: string }
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const updates: Record<string, unknown> = {}
  const allowedStatuses = ['new', 'acknowledged', 'acting', 'resolved', 'dismissed']
  if (typeof body.status === 'string' && allowedStatuses.includes(body.status)) {
    updates.status = body.status
    if (body.status === 'acknowledged' || body.status === 'acting') {
      updates.acknowledged_by = session.user.id
      updates.acknowledged_at = new Date().toISOString()
    }
  }
  if (body.dismissed_reason === null || typeof body.dismissed_reason === 'string') {
    updates.dismissed_reason = body.dismissed_reason
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sage_findings')
    .update(updates)
    .eq('id', params.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
