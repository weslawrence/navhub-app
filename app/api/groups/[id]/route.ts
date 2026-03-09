import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PALETTES, getPalette } from '@/lib/themes'

type Params = { params: { id: string } }

// ─── PATCH /api/groups/[id] ──────────────────────────────────────────────────
// Updates mutable group fields: name, palette_id.
// Requires group_admin or super_admin role.
// Body: { name?, palette_id? }
export async function PATCH(request: Request, { params }: Params) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Only allow updating the active group (prevents cross-group tampering)
  if (params.id !== activeGroupId) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  }

  // Verify the user has admin rights in this group
  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', params.id)
    .single()

  const adminRoles = ['super_admin', 'group_admin']
  if (!membership || !adminRoles.includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden — group admin required' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (name.length < 2) {
      return NextResponse.json({ error: 'Group name must be at least 2 characters' }, { status: 422 })
    }
    updates.name = name
  }

  if (typeof body.palette_id === 'string') {
    const paletteId = body.palette_id.trim()
    const validIds  = PALETTES.map(p => p.id)
    if (!validIds.includes(paletteId)) {
      return NextResponse.json(
        { error: `palette_id must be one of: ${validIds.join(', ')}` },
        { status: 422 }
      )
    }
    // Derive and persist primary_color from palette for backwards-compat
    const palette           = getPalette(paletteId)
    updates.palette_id      = paletteId
    updates.primary_color   = palette.primary
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 422 })
  }

  const admin = createAdminClient()
  const { data: group, error } = await admin
    .from('groups')
    .update(updates)
    .eq('id', params.id)
    .select('id, name, slug, primary_color, palette_id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: group })
}
