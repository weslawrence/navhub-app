import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GroupInvite }  from '@/lib/types'

// ─── POST /api/groups/[id]/invites ────────────────────────────────────────────
// Creates a pending invite for an email address.
// Note: email sending is out of scope — share the NavHub URL with invitee manually.
// Body: { email: string, role: string }

const ADMIN_ROLES   = ['super_admin', 'group_admin']
const INVITABLE_ROLES = ['group_admin', 'company_viewer', 'division_viewer']

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (params.id !== activeGroupId) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', params.id)
    .single()

  if (!membership || !ADMIN_ROLES.includes(membership.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: invites, error } = await admin
    .from('group_invites')
    .select('*')
    .eq('group_id', params.id)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: (invites ?? []) as GroupInvite[] })
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (params.id !== activeGroupId) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', params.id)
    .single()

  if (!membership || !ADMIN_ROLES.includes(membership.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role  = typeof body.role  === 'string' ? body.role  : ''

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }
  if (!INVITABLE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${INVITABLE_ROLES.join(', ')}` },
      { status: 422 }
    )
  }

  const admin = createAdminClient()
  const { data: invite, error } = await admin
    .from('group_invites')
    .upsert(
      { group_id: params.id, email, role, invited_by: session.user.id },
      { onConflict: 'group_id,email', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: invite as GroupInvite }, { status: 201 })
}
