import { NextResponse }       from 'next/server'
import { cookies }            from 'next/headers'
import { createClient }       from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'
import { generateSlug }       from '@/lib/utils'

// ─── GET /api/divisions ───────────────────────────────────────────────────────
// Returns all divisions for a given company.
// Query params:
//   ?company_id=<uuid>        (required)
//   ?include_inactive=true    (default: false)
export async function GET(request: Request) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { searchParams }  = new URL(request.url)
  const companyId         = searchParams.get('company_id')
  const includeInactive   = searchParams.get('include_inactive') === 'true'

  if (!companyId) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 })
  }

  // Verify the company belongs to the active group (RLS enforces this too)
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('group_id', activeGroupId ?? '')
    .single()

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  let query = supabase
    .from('divisions')
    .select('*')
    .eq('company_id', companyId)
    .order('name')

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

// ─── POST /api/divisions ──────────────────────────────────────────────────────
// Creates a new division under a company.
// Body: { company_id, name, description?, industry? }
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

  const companyId = typeof body.company_id === 'string' ? body.company_id.trim() : ''
  const name      = typeof body.name       === 'string' ? body.name.trim()       : ''

  if (!companyId) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 422 })
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 422 })
  }

  // Verify company ownership before creating a division under it
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('group_id', activeGroupId)
    .single()

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const slug        = generateSlug(name)
  const description = typeof body.description === 'string' ? body.description.trim() || null : null
  const industry    = typeof body.industry    === 'string' ? body.industry.trim()    || null : null

  // Slug uniqueness within the company
  const { data: slugConflict } = await supabase
    .from('divisions')
    .select('id')
    .eq('company_id', companyId)
    .eq('slug', slug)
    .maybeSingle()

  if (slugConflict) {
    return NextResponse.json(
      { error: `A division with a similar name already exists (slug "${slug}" taken).` },
      { status: 409 }
    )
  }

  const admin = createAdminClient()
  const { data: division, error } = await admin
    .from('divisions')
    .insert({ company_id: companyId, name, slug, description, industry })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: division }, { status: 201 })
}
