import { NextResponse }       from 'next/server'
import { cookies }            from 'next/headers'
import { createClient }       from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'
import { generateSlug }       from '@/lib/utils'

type Params = { params: { id: string } }

// ─── GET /api/divisions/[id] ─────────────────────────────────────────────────
// Returns a single division with its parent company.
export async function GET(_req: Request, { params }: Params) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Join to companies to verify group ownership via RLS
  const { data: division, error } = await supabase
    .from('divisions')
    .select('*, companies!inner(id, name, group_id)')
    .eq('id', params.id)
    .eq('companies.group_id', activeGroupId ?? '')
    .single()

  if (error || !division) {
    return NextResponse.json({ error: 'Division not found' }, { status: 404 })
  }

  return NextResponse.json({ data: division })
}

// ─── PATCH /api/divisions/[id] ───────────────────────────────────────────────
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

  // Verify the division belongs to a company in the active group
  const { data: existing } = await supabase
    .from('divisions')
    .select('id, name, slug, company_id, companies!inner(group_id)')
    .eq('id', params.id)
    .eq('companies.group_id', activeGroupId ?? '')
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Division not found' }, { status: 404 })
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
    if (newSlug !== existing.slug) {
      const { data: slugConflict } = await supabase
        .from('divisions')
        .select('id')
        .eq('company_id', existing.company_id)
        .eq('slug', newSlug)
        .neq('id', params.id)
        .maybeSingle()

      if (slugConflict) {
        return NextResponse.json(
          { error: `A division with a similar name already exists (slug "${newSlug}" taken).` },
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
  const { data: division, error } = await admin
    .from('divisions')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: division })
}

// ─── DELETE /api/divisions/[id] ──────────────────────────────────────────────
// Soft-deletes a division by setting is_active = false.
export async function DELETE(_req: Request, { params }: Params) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: existing } = await supabase
    .from('divisions')
    .select('id, companies!inner(group_id)')
    .eq('id', params.id)
    .eq('companies.group_id', activeGroupId ?? '')
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Division not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('divisions')
    .update({ is_active: false })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { id: params.id, is_active: false } })
}
