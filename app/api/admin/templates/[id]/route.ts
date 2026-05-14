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

const ALLOWED_FIELDS = new Set([
  'name', 'slug', 'category', 'description', 'summary_capabilities',
  'avatar_preset', 'avatar_url', 'color',
  'persona', 'instructions', 'communication_style', 'response_length',
  'default_tools', 'default_complexity',
  'is_published', 'is_featured', 'sort_order',
])

// ── GET /api/admin/templates/[id] ──────────────────────────────────────────
// Returns the template plus its assigned skill IDs and knowledge IDs so the
// editor can render the Skills + Knowledge tabs without a second round-trip.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: template, error } = await admin
    .from('agent_templates')
    .select('*')
    .eq('id', params.id)
    .single()
  if (error || !template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: skillRows }, { data: knowledgeRows }] = await Promise.all([
    admin.from('agent_template_skills').select('skill_id, sort_order').eq('template_id', params.id).order('sort_order'),
    admin.from('agent_template_knowledge').select('knowledge_id, sort_order').eq('template_id', params.id).order('sort_order'),
  ])

  return NextResponse.json({
    data: {
      ...template,
      skill_ids:     (skillRows     ?? []).map(r => (r as { skill_id: string }).skill_id),
      knowledge_ids: (knowledgeRows ?? []).map(r => (r as { knowledge_id: string }).knowledge_id),
    },
  })
}

// ── PATCH /api/admin/templates/[id] ────────────────────────────────────────
// Body: any subset of ALLOWED_FIELDS, plus optional `skill_ids` and
// `knowledge_ids` arrays which replace the join-table contents.
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
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k)) updates[k] = v
  }
  updates.updated_at = new Date().toISOString()

  const admin = createAdminClient()
  if (Object.keys(updates).length > 1) {  // > 1 because updated_at is always there
    const { error } = await admin.from('agent_templates').update(updates).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Replace skill assignments if `skill_ids` was provided.
  if (Array.isArray(body.skill_ids)) {
    const ids = (body.skill_ids as unknown[]).filter((x): x is string => typeof x === 'string')
    await admin.from('agent_template_skills').delete().eq('template_id', params.id)
    if (ids.length > 0) {
      await admin.from('agent_template_skills').insert(
        ids.map((sid, idx) => ({ template_id: params.id, skill_id: sid, sort_order: idx })),
      )
    }
  }

  // Replace knowledge assignments if `knowledge_ids` was provided.
  if (Array.isArray(body.knowledge_ids)) {
    const ids = (body.knowledge_ids as unknown[]).filter((x): x is string => typeof x === 'string')
    await admin.from('agent_template_knowledge').delete().eq('template_id', params.id)
    if (ids.length > 0) {
      await admin.from('agent_template_knowledge').insert(
        ids.map((kid, idx) => ({ template_id: params.id, knowledge_id: kid, sort_order: idx })),
      )
    }
  }

  const { data: refreshed } = await admin.from('agent_templates').select('*').eq('id', params.id).single()
  return NextResponse.json({ data: refreshed })
}

// ── DELETE /api/admin/templates/[id] ───────────────────────────────────────
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('agent_templates').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
