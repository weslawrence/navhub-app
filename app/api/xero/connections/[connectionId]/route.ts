import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'

export const runtime = 'nodejs'

// ─── PATCH /api/xero/connections/[connectionId] ───────────────────────────────
// Link or unlink a Xero connection to a company or division.
// Body: { entity_type: 'company'|'division', entity_id: string | null }

export async function PATCH(
  request: Request,
  { params }: { params: { connectionId: string } }
) {
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

  const { entity_type, entity_id } = body as {
    entity_type: string | null
    entity_id:   string | null
  }

  if (entity_id !== null) {
    if (entity_type !== 'company' && entity_type !== 'division') {
      return NextResponse.json({ error: 'entity_type must be company or division' }, { status: 400 })
    }

    // Verify the target entity belongs to the active group
    if (entity_type === 'company') {
      const { data: co } = await supabase
        .from('companies')
        .select('id')
        .eq('id', entity_id)
        .eq('group_id', activeGroupId)
        .single()
      if (!co) return NextResponse.json({ error: 'Company not found in this group' }, { status: 404 })
    } else {
      const { data: div } = await supabase
        .from('divisions')
        .select('id, companies!inner(group_id)')
        .eq('id', entity_id)
        .eq('companies.group_id', activeGroupId)
        .single()
      if (!div) return NextResponse.json({ error: 'Division not found in this group' }, { status: 404 })
    }
  }

  // Verify the connection currently belongs to the active group
  const { data: existing } = await supabase
    .from('xero_connections')
    .select('id, company:companies!left(group_id), division:divisions!left(company_id, companies!inner(group_id))')
    .eq('id', params.connectionId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  // Update
  const admin = createAdminClient()
  const updates: Record<string, string | null> = {}

  if (entity_id === null) {
    updates.company_id  = null
    updates.division_id = null
  } else if (entity_type === 'company') {
    updates.company_id  = entity_id
    updates.division_id = null
  } else {
    updates.division_id = entity_id
    updates.company_id  = null
  }

  const { data: updated, error } = await admin
    .from('xero_connections')
    .update(updates)
    .eq('id', params.connectionId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}

// ─── DELETE /api/xero/connections/[connectionId] ──────────────────────────────
// Disconnect (hard delete) a Xero connection.

export async function DELETE(
  _request: Request,
  { params }: { params: { connectionId: string } }
) {
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

  const admin = createAdminClient()
  const { error } = await admin
    .from('xero_connections')
    .delete()
    .eq('id', params.connectionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { id: params.connectionId } })
}
