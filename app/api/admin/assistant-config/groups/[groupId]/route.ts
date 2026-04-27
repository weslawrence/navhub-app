import { NextResponse }     from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET   /api/admin/assistant-config/groups/[groupId]  — fetch group override row
 * PATCH /api/admin/assistant-config/groups/[groupId]  — upsert group override row
 *
 * super_admin only.
 */

async function isSuperAdmin(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
    .limit(1)
  return !!data && data.length > 0
}

export async function GET(_req: Request, { params }: { params: { groupId: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isSuperAdmin(supabase, session.user.id))) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('assistant_config')
    .select('id, persona_name, persona_tone, scope_text, knowledge_text, restrictions, is_active, updated_at, group_id')
    .eq('group_id', params.groupId)
    .maybeSingle()

  return NextResponse.json({ data: data ?? null })
}

export async function PATCH(req: Request, { params }: { params: { groupId: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isSuperAdmin(supabase, session.user.id))) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 })
  }

  const body = await req.json() as {
    persona_name?:   string
    persona_tone?:   string
    scope_text?:     string | null
    knowledge_text?: string | null
    restrictions?:   string | null
    is_active?:      boolean
  }

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('assistant_config')
    .select('id')
    .eq('group_id', params.groupId)
    .maybeSingle()

  const payload: Record<string, unknown> = {
    updated_by: session.user.id,
    updated_at: new Date().toISOString(),
  }
  if (body.persona_name?.trim()) payload.persona_name = body.persona_name.trim()
  if (body.persona_tone?.trim()) payload.persona_tone = body.persona_tone.trim()
  if (body.scope_text     !== undefined) payload.scope_text     = body.scope_text
  if (body.knowledge_text !== undefined) payload.knowledge_text = body.knowledge_text
  if (body.restrictions   !== undefined) payload.restrictions   = body.restrictions
  if (body.is_active      !== undefined) payload.is_active      = !!body.is_active

  let saved
  if (existing) {
    saved = await admin
      .from('assistant_config')
      .update(payload)
      .eq('id', existing.id)
      .select('id, persona_name, persona_tone, scope_text, knowledge_text, restrictions, is_active, updated_at, group_id')
      .single()
  } else {
    saved = await admin
      .from('assistant_config')
      .insert({ group_id: params.groupId, ...payload })
      .select('id, persona_name, persona_tone, scope_text, knowledge_text, restrictions, is_active, updated_at, group_id')
      .single()
  }

  if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 })
  return NextResponse.json({ data: saved.data })
}
