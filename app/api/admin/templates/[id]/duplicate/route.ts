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

// POST — clones an existing template (with its skill + knowledge joins)
// into a fresh draft row. Sibling routes still own publish / edit.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: src, error } = await admin
    .from('agent_templates')
    .select('*')
    .eq('id', params.id)
    .single()
  if (error || !src) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const original = src as Record<string, unknown> & { name: string; slug: string }

  // Generate a unique slug — `<slug>-copy`, then `-copy-2`, `-copy-3`…
  let candidate = `${original.slug}-copy`
  let suffix    = 2
  for (;;) {
    const { data: clash } = await admin
      .from('agent_templates')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (!clash) break
    candidate = `${original.slug}-copy-${suffix++}`
    if (suffix > 50) break  // give up — shouldn't happen
  }

  const insert: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(original)) {
    if (k === 'id' || k === 'created_at' || k === 'updated_at' || k === 'use_count') continue
    insert[k] = v
  }
  insert.name         = `${original.name} (copy)`
  insert.slug         = candidate
  insert.is_published = false
  insert.is_featured  = false
  insert.use_count    = 0
  insert.created_by   = session.user.id

  const { data: copy, error: copyErr } = await admin
    .from('agent_templates')
    .insert(insert)
    .select('id')
    .single()
  if (copyErr || !copy) return NextResponse.json({ error: copyErr?.message ?? 'Copy failed' }, { status: 500 })

  // Clone join tables.
  const [{ data: skillRows }, { data: knowledgeRows }] = await Promise.all([
    admin.from('agent_template_skills').select('skill_id, sort_order').eq('template_id', params.id),
    admin.from('agent_template_knowledge').select('knowledge_id, sort_order').eq('template_id', params.id),
  ])
  if (skillRows && skillRows.length > 0) {
    await admin.from('agent_template_skills').insert(skillRows.map(r => ({
      template_id: (copy as { id: string }).id,
      skill_id:    (r as { skill_id: string }).skill_id,
      sort_order:  (r as { sort_order: number }).sort_order,
    })))
  }
  if (knowledgeRows && knowledgeRows.length > 0) {
    await admin.from('agent_template_knowledge').insert(knowledgeRows.map(r => ({
      template_id:  (copy as { id: string }).id,
      knowledge_id: (r as { knowledge_id: string }).knowledge_id,
      sort_order:   (r as { sort_order: number }).sort_order,
    })))
  }

  return NextResponse.json({ data: { id: (copy as { id: string }).id } }, { status: 201 })
}
