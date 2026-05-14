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

function toSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

const ALLOWED_CATEGORIES = ['legal','financial','marketing','operations','hr','general','technical','compliance']

// ── GET /api/admin/templates ────────────────────────────────────────────────
// Lists ALL templates (published + draft) for super admins.
export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_templates')
    .select('*')
    .order('is_featured', { ascending: false })
    .order('sort_order',  { ascending: true })
    .order('created_at',  { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ── POST /api/admin/templates ──────────────────────────────────────────────
// Body: { name, category, description, summary_capabilities, persona?,
//         instructions?, communication_style?, response_length?,
//         default_tools?, default_complexity?, avatar_preset?, color? }
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

  const name     = typeof body.name === 'string' ? body.name.trim() : ''
  const category = typeof body.category === 'string' ? body.category : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}` }, { status: 400 })
  }

  const slug        = typeof body.slug === 'string' && body.slug.trim() ? toSlug(body.slug) : toSlug(name)
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const summary     = typeof body.summary_capabilities === 'string' ? body.summary_capabilities.trim() : ''

  const admin = createAdminClient()
  const insert: Record<string, unknown> = {
    name,
    slug,
    category,
    description: description || 'No description provided.',
    summary_capabilities: summary || 'This agent can: (capabilities to be defined)',
    created_by: session.user.id,
  }

  if (typeof body.persona             === 'string') insert.persona             = body.persona
  if (typeof body.instructions        === 'string') insert.instructions        = body.instructions
  if (typeof body.communication_style === 'string') insert.communication_style = body.communication_style
  if (typeof body.response_length     === 'string') insert.response_length     = body.response_length
  if (typeof body.default_complexity  === 'string') insert.default_complexity  = body.default_complexity
  if (typeof body.avatar_preset       === 'string') insert.avatar_preset       = body.avatar_preset
  if (typeof body.avatar_url          === 'string') insert.avatar_url          = body.avatar_url
  if (typeof body.color               === 'string') insert.color               = body.color
  if (Array.isArray(body.default_tools)) {
    insert.default_tools = (body.default_tools as unknown[]).filter((x): x is string => typeof x === 'string')
  }

  const { data, error } = await admin
    .from('agent_templates')
    .insert(insert)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
