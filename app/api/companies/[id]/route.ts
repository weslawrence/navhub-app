import { NextResponse }       from 'next/server'
import { cookies }            from 'next/headers'
import { createClient }       from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'
import { generateSlug }       from '@/lib/utils'

type Params = { params: { id: string } }

// ─── GET /api/companies/[id] ─────────────────────────────────────────────────
// Returns a single company with its divisions array.
export async function GET(_req: Request, { params }: Params) {
  const supabase    = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: company, error } = await supabase
    .from('companies')
    .select('*, divisions(*)')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()

  if (error || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  return NextResponse.json({ data: company })
}

// ─── PATCH /api/companies/[id] ───────────────────────────────────────────────
// Updates name, description, industry, and/or is_active.
// Body: { name?, description?, industry?, is_active? }
export async function PATCH(request: Request, { params }: Params) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Verify this company belongs to the active group before mutating
  const { data: existing } = await supabase
    .from('companies')
    .select('id, name, slug')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const newName = body.name.trim()
    if (!newName) {
      return NextResponse.json({ error: 'name cannot be empty' }, { status: 422 })
    }
    const newSlug = generateSlug(newName)
    // Only check slug uniqueness if the name actually changed
    if (newSlug !== existing.slug) {
      const { data: slugConflict } = await supabase
        .from('companies')
        .select('id')
        .eq('group_id', activeGroupId ?? '')
        .eq('slug', newSlug)
        .neq('id', params.id)
        .maybeSingle()

      if (slugConflict) {
        return NextResponse.json(
          { error: `A company with a similar name already exists (slug "${newSlug}" taken).` },
          { status: 409 }
        )
      }
      updates.slug = newSlug
    }
    updates.name = newName
  }

  if ('description' in body) {
    updates.description = typeof body.description === 'string'
      ? body.description.trim() || null
      : null
  }

  if ('industry' in body) {
    updates.industry = typeof body.industry === 'string'
      ? body.industry.trim() || null
      : null
  }

  if (typeof body.is_active === 'boolean') {
    updates.is_active = body.is_active
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 422 })
  }

  const admin = createAdminClient()
  const { data: company, error } = await admin
    .from('companies')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: company })
}

// ─── DELETE /api/companies/[id] ──────────────────────────────────────────────
// Soft-deletes a company by setting is_active = false.
// Hard deletes are never performed — financial snapshots must remain intact.
export async function DELETE(_req: Request, { params }: Params) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Verify ownership before mutating
  const { data: existing } = await supabase
    .from('companies')
    .select('id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('companies')
    .update({ is_active: false })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { id: params.id, is_active: false } })
}
