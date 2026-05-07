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

type Params = { params: { id: string } }

// ── GET /api/admin/skills/[id] ────────────────────────────────────────────────
export async function GET(_request: Request, { params }: Params) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('skills')
    .select('*, skill_knowledge_documents(id, file_name, file_type, document_id)')
    .eq('id', params.id)
    .eq('tier', 'platform')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
  return NextResponse.json({ data })
}

// ── PATCH /api/admin/skills/[id] ──────────────────────────────────────────────
// Bumps version. Accepts partial updates: any of the editable columns plus
// is_published flip.
export async function PATCH(request: Request, { params }: Params) {
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
  for (const k of [
    'name', 'category', 'description', 'instructions',
    'knowledge_text', 'examples', 'slug',
  ]) {
    if (typeof body[k] === 'string') updates[k] = body[k]
    else if (body[k] === null)        updates[k] = null
  }
  if (Array.isArray(body.tool_grants)) {
    updates.tool_grants = (body.tool_grants as unknown[])
      .filter((x): x is string => typeof x === 'string')
  }
  if (typeof body.is_active    === 'boolean') updates.is_active    = body.is_active
  if (typeof body.is_published === 'boolean') updates.is_published = body.is_published

  // Bump version on every edit so consumers can tell when the prompt changed.
  if (Object.keys(updates).length > 0) {
    const admin = createAdminClient()
    const { data: current } = await admin
      .from('skills')
      .select('version')
      .eq('id', params.id)
      .eq('tier', 'platform')
      .single()
    if (!current) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

    updates.version    = ((current as { version?: number }).version ?? 1) + (body.bump_version === false ? 0 : 1)
    updates.updated_at = new Date().toISOString()

    const { data, error } = await admin
      .from('skills')
      .update(updates)
      .eq('id', params.id)
      .eq('tier', 'platform')
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  return NextResponse.json({ data: null })
}

// ── DELETE /api/admin/skills/[id] ────────────────────────────────────────────
export async function DELETE(_request: Request, { params }: Params) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('skills')
    .delete()
    .eq('id', params.id)
    .eq('tier', 'platform')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id: params.id, deleted: true } })
}
