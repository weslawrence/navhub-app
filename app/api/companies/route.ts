import { NextResponse }       from 'next/server'
import { cookies }            from 'next/headers'
import { createClient }       from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'
import { generateSlug }       from '@/lib/utils'

// ─── GET /api/companies ──────────────────────────────────────────────────────
// Returns all companies for the active group, with division count,
// and Xero connection status (has_xero, last_synced_at).
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

  // ── Fetch Xero connection status ─────────────────────────────────────────

  // Extract company and division IDs from query results
  const companyIds  = (data ?? []).map(c => c.id)
  const divisionIds = (data ?? []).flatMap(c =>
    Array.isArray(c.divisions) ? (c.divisions as { id: string }[]).map(d => d.id) : []
  )

  // Build division_id → company_id lookup for resolving division-level Xero connections
  const divisionToCompany: Record<string, string> = {}
  for (const company of data ?? []) {
    if (Array.isArray(company.divisions)) {
      for (const div of company.divisions as { id: string }[]) {
        divisionToCompany[div.id] = company.id
      }
    }
  }

  // Fetch xero_connections for all relevant company/division IDs
  let xeroConnections: { company_id: string | null; division_id: string | null; updated_at: string | null }[] = []
  if (companyIds.length > 0) {
    const orParts: string[] = [`company_id.in.(${companyIds.join(',')})`]
    if (divisionIds.length > 0) {
      orParts.push(`division_id.in.(${divisionIds.join(',')})`)
    }
    const { data: xeroData } = await supabase
      .from('xero_connections')
      .select('company_id, division_id, updated_at')
      .or(orParts.join(','))
    xeroConnections = xeroData ?? []
  }

  // Build per-company Xero status map
  const xeroMap: Record<string, { has_xero: boolean; last_synced_at: string | null }> = {}
  for (const conn of xeroConnections) {
    // Resolve the owning company (company-level or via division lookup)
    const compId = conn.company_id ?? (conn.division_id ? divisionToCompany[conn.division_id] : null)
    if (!compId) continue

    if (!xeroMap[compId]) {
      xeroMap[compId] = { has_xero: true, last_synced_at: conn.updated_at }
    } else {
      // Keep the most-recent sync timestamp across all connections for this company
      if (
        conn.updated_at &&
        (!xeroMap[compId].last_synced_at || conn.updated_at > xeroMap[compId].last_synced_at!)
      ) {
        xeroMap[compId].last_synced_at = conn.updated_at
      }
    }
  }

  // ── Build final response ─────────────────────────────────────────────────

  const companies = (data ?? []).map(({ divisions, ...c }) => ({
    ...c,
    division_count:  Array.isArray(divisions) ? divisions.length : 0,
    has_xero:        xeroMap[c.id]?.has_xero       ?? false,
    last_synced_at:  xeroMap[c.id]?.last_synced_at ?? null,
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
