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
    entity_type: 'agent',
    entity_id:   entityId,
    metadata:    metadata ?? null,
  })
}

// ─── GET /api/admin/agents/[id] ───────────────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  const { data: agent } = await admin
    .from('agents')
    .select('id, name, model, persona, instructions, tools, is_active, group_id, created_at')
    .eq('id', params.id)
    .single()

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { data: group } = await admin
    .from('groups')
    .select('id, name')
    .eq('id', (agent as { group_id: string }).group_id)
    .single()

  return NextResponse.json({ data: { agent, group } })
}

// ─── PATCH /api/admin/agents/[id] ─────────────────────────────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin   = createAdminClient()
  const agentId = params.id
  const body    = await req.json() as Record<string, unknown>

  const allowed = ['name', 'persona', 'instructions', 'model', 'tools', 'is_active']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { error } = await admin.from('agents').update(updates).eq('id', agentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(admin, session.user.id, 'update_agent', agentId, { updates })
  return NextResponse.json({ success: true })
}

// ─── DELETE /api/admin/agents/[id] ────────────────────────────────────────────
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin   = createAdminClient()
  const agentId = params.id

  const { error } = await admin.from('agents').update({ is_active: false }).eq('id', agentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAudit(admin, session.user.id, 'deactivate_agent', agentId)
  return NextResponse.json({ success: true })
}
