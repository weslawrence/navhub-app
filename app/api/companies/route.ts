import { NextResponse }       from 'next/server'
import { cookies }            from 'next/headers'
import { createClient }       from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'
import { generateSlug }       from '@/lib/utils'

// ─── GET /api/companies ──────────────────────────────────────────────────────
// Returns all companies for the active group, with division count.
// Query params:
//   ?include_inactive=true  → include is_active=false rows (default: false)
export async function GET(request: Request) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  if (!activeGroupId) {
    return NextResponse.json({ error: 'No active group' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const includeInactive  = searchParams.get('include_inactive') === 'true'

  let query = supabase
    .from('companies')
    .select('*, divisions(id)')
    .eq('group_id', activeGroupId)
    .order('name')

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Compute division_count from the nested array
  const companies = (data ?? []).map(({ divisions, ...c }) => ({
    ...c,
    division_count: Array.isArray(divisions) ? divisions.length : 0,
  }))

  return NextResponse.json({ data: companies })
}

// ─── POST /api/companies ─────────────────────────────────────────────────────
// Creates a new company under the active group.
// Body: { name, description?, industry? }
export async function POST(request: Request) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  if (!activeGroupId) {
    return NextResponse.json({ error: 'No active group' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 422 })
  }

  const slug        = generateSlug(name)
  const description = typeof body.description === 'string' ? body.description.trim() || null : null
  const industry    = typeof body.industry    === 'string' ? body.industry.trim()    || null : null

  // Check slug uniqueness within the group (use server client — RLS allows reads)
  const { data: existing } = await supabase
    .from('companies')
    .select('id')
    .eq('group_id', activeGroupId)
    .eq('slug', slug)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: `A company with a similar name already exists (slug "${slug}" taken).` },
      { status: 409 }
    )
  }

  const admin = createAdminClient()
  const { data: company, error } = await admin
    .from('companies')
    .insert({ group_id: activeGroupId, name, slug, description, industry })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: company }, { status: 201 })
}
