import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

// ─── POST /api/admin/groups/[id]/transfer-owner ───────────────────────────────
// Transfers group ownership: demotes the current owner to group_admin, promotes
// the new owner to group_owner, and updates groups.owner_user_id. Super admin only.
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { new_owner_id } = await request.json() as { new_owner_id?: string }
  if (!new_owner_id) return NextResponse.json({ error: 'new_owner_id is required' }, { status: 400 })

  const admin = createAdminClient()

  // Verify the new owner is a member of this group
  const { data: membership } = await admin
    .from('user_groups')
    .select('user_id, role')
    .eq('group_id', params.id)
    .eq('user_id', new_owner_id)
    .single()
  if (!membership) {
    return NextResponse.json({ error: 'Selected user is not a member of this group' }, { status: 422 })
  }

  // Demote any current owner to group_admin
  await admin
    .from('user_groups')
    .update({ role: 'group_admin' })
    .eq('group_id', params.id)
    .eq('role', 'group_owner')

  // Promote the new owner
  await admin
    .from('user_groups')
    .update({ role: 'group_owner' })
    .eq('group_id', params.id)
    .eq('user_id', new_owner_id)

  // Update groups.owner_user_id
  await admin
    .from('groups')
    .update({ owner_user_id: new_owner_id })
    .eq('id', params.id)

  void admin.from('admin_audit_log').insert({
    actor_id:    session.user.id,
    action:      'transfer_owner',
    entity_type: 'group',
    entity_id:   params.id,
    metadata:    { new_owner_id },
  })

  return NextResponse.json({ success: true })
}
