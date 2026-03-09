import { NextResponse }     from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// ── GET /api/agents/[id] ─────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase   = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()

  if (error || !agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  return NextResponse.json({ data: agent })
}

// ── PATCH /api/agents/[id] ───────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase   = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  // Verify admin + agent belongs to group (RLS read)
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()
  if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', activeGroupId)
    .single()
  const isAdmin = membership?.role === 'super_admin' || membership?.role === 'group_admin'
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  const textFields = ['name', 'description', 'avatar_color', 'model', 'persona_preset', 'persona', 'instructions', 'email_address', 'email_display_name', 'slack_channel'] as const
  for (const f of textFields) {
    if (f in body) updates[f] = typeof body[f] === 'string' ? (body[f] as string).trim() || null : null
  }
  if ('name' in body && (!updates.name || (updates.name as string).length < 1)) {
    return NextResponse.json({ error: 'Name cannot be empty' }, { status: 422 })
  }
  if ('tools' in body)          updates.tools          = Array.isArray(body.tools) ? body.tools : []
  if ('company_scope' in body)  updates.company_scope  = Array.isArray(body.company_scope) && (body.company_scope as unknown[]).length > 0 ? body.company_scope : null
  if ('email_recipients' in body) updates.email_recipients = Array.isArray(body.email_recipients) && (body.email_recipients as unknown[]).length > 0 ? body.email_recipients : null
  if ('is_active' in body)      updates.is_active      = !!body.is_active

  const admin = createAdminClient()
  const { data: agent, error } = await admin
    .from('agents')
    .update(updates)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: agent })
}

// ── DELETE /api/agents/[id] ──────────────────────────────────────────────────
// Soft delete (is_active = false)

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase   = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()
  if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', activeGroupId)
    .single()
  const isAdmin = membership?.role === 'super_admin' || membership?.role === 'group_admin'
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const admin = createAdminClient()
  await admin.from('agents').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', params.id)

  return NextResponse.json({ data: { id: params.id, is_active: false } })
}
