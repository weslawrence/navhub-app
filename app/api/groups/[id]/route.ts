import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: { id: string } }

// ─── PATCH /api/groups/[id] ──────────────────────────────────────────────────
// Updates mutable group fields (currently: primary_color).
// Requires group_admin or super_admin role.
// Body: { primary_color? }
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

  if (typeof body.primary_color === 'string') {
    const color = body.primary_color.trim()
    // Validate hex colour (#rrggbb or #rgb)
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      return NextResponse.json({ error: 'primary_color must be a valid hex colour (e.g. #0ea5e9)' }, { status: 422 })
    }
    updates.primary_color = color
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 422 })
  }

  const admin = createAdminClient()
  const { data: group, error } = await admin
    .from('groups')
    .update(updates)
    .eq('id', params.id)
    .select('id, name, slug, primary_color')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: group })
}
