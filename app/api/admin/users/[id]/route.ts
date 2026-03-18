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

async function logAudit(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string,
  action: string,
  entityId: string,
  metadata?: Record<string, unknown>
) {
  void admin.from('admin_audit_log').insert({
    actor_id:    actorId,
    action,
    entity_type: 'user',
    entity_id:   entityId,
    metadata:    metadata ?? null,
  })
}

// ─── PATCH /api/admin/users/[id] ──────────────────────────────────────────────
// Updates role in user_groups (and optionally which group).
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin  = createAdminClient()
  const userId = params.id
  const { role, group_id } = await req.json() as { role?: string; group_id?: string }

  if (!role && !group_id) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (role)     updates.role     = role
  if (group_id) updates.group_id = group_id

  // Update the user_groups record — if group_id is changing, upsert to the new group
  const { error } = await admin
    .from('user_groups')
    .update(updates)
    .eq('user_id', userId)
    // If group_id supplied, target that specific membership; else update first found
    .eq('group_id', group_id ?? (updates.group_id as string))

  if (error) {
    // Try upsert if no matching row
    const { error: upsertErr } = await admin.from('user_groups').upsert({
      user_id:  userId,
      group_id: group_id ?? '',
      role:     role ?? 'company_viewer',
    }, { onConflict: 'user_id,group_id' })
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  await logAudit(admin, session.user.id, 'update_user', userId, updates)
  return NextResponse.json({ success: true })
}

// ─── DELETE /api/admin/users/[id] ─────────────────────────────────────────────
// Disables user login by banning them.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin  = createAdminClient()
  const userId = params.id

  // Ban the user (disables login without deleting data)
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: '876600h', // ~100 years = effectively permanent
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(admin, session.user.id, 'deactivate_user', userId)
  return NextResponse.json({ success: true })
}
