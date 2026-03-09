import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── PATCH /api/groups/[id]/members/[userId] ─────────────────────────────────
// Updates a member's role.
// Body: { role: string }
// Cannot demote the last super_admin.
//
// ─── DELETE /api/groups/[id]/members/[userId] ────────────────────────────────
// Removes a member from the group.
// Cannot remove the last super_admin.

const ADMIN_ROLES   = ['super_admin', 'group_admin']
const ALLOWED_ROLES = ['super_admin', 'group_admin', 'company_viewer', 'division_viewer']

type Params = { params: { id: string; userId: string } }

async function verifyAdminAccess(groupId: string, callerUserId: string, activeGroupId: string | undefined) {
  if (groupId !== activeGroupId) return 'not_found'
  const supabase = createClient()
  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', callerUserId)
    .eq('group_id', groupId)
    .single()
  if (!membership || !ADMIN_ROLES.includes(membership.role)) return 'forbidden'
  return 'ok'
}

async function checkLastSuperAdmin(groupId: string, targetUserId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: superAdmins } = await admin
    .from('user_groups')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('role', 'super_admin')
  const admins = (superAdmins ?? []) as { user_id: string }[]
  return admins.length === 1 && admins[0].user_id === targetUserId
}

export async function PATCH(request: Request, { params }: Params) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const access = await verifyAdminAccess(params.id, session.user.id, activeGroupId)
  if (access === 'not_found') return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  if (access === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const newRole = typeof body.role === 'string' ? body.role : null
  if (!newRole || !ALLOWED_ROLES.includes(newRole)) {
    return NextResponse.json({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` }, { status: 422 })
  }

  // Protect last super_admin from demotion
  if (newRole !== 'super_admin') {
    const isLast = await checkLastSuperAdmin(params.id, params.userId)
    if (isLast) {
      return NextResponse.json(
        { error: 'Cannot demote the last super_admin. Promote another member first.' },
        { status: 422 }
      )
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_groups')
    .update({ role: newRole })
    .eq('group_id', params.id)
    .eq('user_id', params.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { user_id: params.userId, role: newRole } })
}

export async function DELETE(_request: Request, { params }: Params) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const access = await verifyAdminAccess(params.id, session.user.id, activeGroupId)
  if (access === 'not_found') return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  if (access === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  // Protect last super_admin from removal
  const isLast = await checkLastSuperAdmin(params.id, params.userId)
  if (isLast) {
    return NextResponse.json(
      { error: 'Cannot remove the last super_admin.' },
      { status: 422 }
    )
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_groups')
    .delete()
    .eq('group_id', params.id)
    .eq('user_id', params.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { user_id: params.userId } })
}
