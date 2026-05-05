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
const ALLOWED_ROLES = ['super_admin', 'group_admin', 'manager', 'viewer']

type Params = { params: { id: string; userId: string } }

async function verifyAdminAccess(groupId: string, callerUserId: string, activeGroupId: string | undefined) {
  if (groupId !== activeGroupId) return { status: 'not_found' as const }
  const supabase = createClient()
  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', callerUserId)
    .eq('group_id', groupId)
    .single()
  if (!membership || !ADMIN_ROLES.includes(membership.role)) return { status: 'forbidden' as const }
  return { status: 'ok' as const, role: membership.role as string }
}

// Look up the target member's current role so we can guard against group_admins
// modifying super_admins.
async function getTargetRole(groupId: string, userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { role?: string } | null)?.role ?? null
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
  if (access.status === 'not_found') return NextResponse.json({ error: 'Group not found' },     { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  const callerIsSuper = access.role === 'super_admin'

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const newRole = typeof body.role === 'string' ? body.role : null
  if (!newRole || !ALLOWED_ROLES.includes(newRole)) {
    return NextResponse.json({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` }, { status: 422 })
  }

  // Super-admin protection: only super_admins can mint or modify super_admins.
  // Group admins must never be able to assign super_admin or change a
  // super_admin's role even with a forged request.
  const targetRole = await getTargetRole(params.id, params.userId)
  if (!callerIsSuper && (newRole === 'super_admin' || targetRole === 'super_admin')) {
    return NextResponse.json(
      { error: 'Only super admins can assign or modify the super admin role.' },
      { status: 403 },
    )
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
  if (access.status === 'not_found') return NextResponse.json({ error: 'Group not found' },     { status: 404 })
  if (access.status === 'forbidden') return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  const callerIsSuper = access.role === 'super_admin'

  // Group admins can't remove super_admins.
  const targetRole = await getTargetRole(params.id, params.userId)
  if (!callerIsSuper && targetRole === 'super_admin') {
    return NextResponse.json(
      { error: 'Only super admins can remove a super admin.' },
      { status: 403 },
    )
  }

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
