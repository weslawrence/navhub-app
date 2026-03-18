import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GroupMember }  from '@/lib/types'

// ─── GET /api/groups/[id]/members ────────────────────────────────────────────
// Returns all members of a group (email + role).
// Requires group_admin or super_admin role.
// super_admin can view any group's members (not limited to activeGroupId).

const ADMIN_ROLES = ['super_admin', 'group_admin']

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase      = createClient()
    const cookieStore   = cookies()
    const activeGroupId = cookieStore.get('active_group_id')?.value

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // Verify caller is admin in their active group
    const { data: membership } = await supabase
      .from('user_groups')
      .select('role')
      .eq('user_id', session.user.id)
      .eq('group_id', activeGroupId ?? '')
      .single()

    if (!membership || !ADMIN_ROLES.includes(membership.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    // super_admin can view any group; others are restricted to their active group
    const isSuperAdmin = membership.role === 'super_admin'
    if (!isSuperAdmin && params.id !== activeGroupId) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const admin = createAdminClient()

    // Get all user_groups rows for this group
    const { data: userGroups, error } = await admin
      .from('user_groups')
      .select('user_id, role, is_default, created_at')
      .eq('group_id', params.id)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch all users in one call (much faster than individual getUserById calls)
    const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const emailMap: Record<string, string> = {}
    users.forEach(u => { emailMap[u.id] = u.email ?? '' })

    const members: GroupMember[] = (userGroups ?? []).map((ug: {
      user_id: string; role: string; is_default: boolean; created_at: string
    }) => ({
      user_id:    ug.user_id,
      email:      emailMap[ug.user_id] ?? '',
      role:       ug.role,
      is_default: ug.is_default,
      joined_at:  ug.created_at,
    }))

    return NextResponse.json({ data: members })
  } catch (err) {
    console.error('Members API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
