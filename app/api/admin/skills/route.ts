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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'skill'
}

// ── GET /api/admin/skills ────────────────────────────────────────────────────
// Returns every PLATFORM-tier skill (published + unpublished).
export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('skills')
    .select('*, skill_knowledge_documents(file_name, document_id)')
    .eq('tier', 'platform')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ── POST /api/admin/skills ───────────────────────────────────────────────────
// Creates a new platform-tier skill. Body: full skill payload (sans id, tier).
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const name         = typeof body.name         === 'string' ? body.name.trim()         : ''
  const description  = typeof body.description  === 'string' ? body.description.trim()  : ''
  const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : ''
  if (!name || !description || !instructions) {
    return NextResponse.json(
      { error: 'name, description and instructions are required' },
      { status: 400 },
    )
  }

  const slugRaw = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : name
  const slug    = slugify(slugRaw)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('skills')
    .insert({
      tier:           'platform',
      group_id:       null,
      name,
      slug,
      category:       typeof body.category    === 'string' ? body.category.trim()       : null,
      description,
      instructions,
      knowledge_text: typeof body.knowledge_text === 'string' ? body.knowledge_text     : null,
      examples:       typeof body.examples       === 'string' ? body.examples           : null,
      tool_grants:    Array.isArray(body.tool_grants)
        ? (body.tool_grants as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      is_active:      body.is_active    !== false,
      is_published:   !!body.is_published,
      version:        1,
      created_by:     session.user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
