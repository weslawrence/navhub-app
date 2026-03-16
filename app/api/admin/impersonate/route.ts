import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/encryption'

export const IMPERSONATE_COOKIE = 'navhub_impersonate_group'

// ─── POST /api/admin/impersonate ──────────────────────────────────────────────
// Sets the impersonation cookie (super_admin only).
// Also updates active_group_id so all existing API routes work transparently.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Verify caller is super_admin in at least one group
  const admin = createAdminClient()
  const { data: memberships } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('role', 'super_admin')

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: 'Forbidden — super_admin required' }, { status: 403 })
  }

  const body = await request.json() as { group_id?: string }
  const { group_id } = body
  if (!group_id) return NextResponse.json({ error: 'group_id required' }, { status: 400 })

  // Verify the target group exists
  const { data: group } = await admin
    .from('groups')
    .select('id, name')
    .eq('id', group_id)
    .single()

  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const cookieStore = cookies()

  // Encrypt group_id and set impersonation marker cookie
  const encrypted = encrypt(group_id)
  cookieStore.set(IMPERSONATE_COOKIE, encrypted, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   60 * 60 * 2, // 2 hours
  })

  // Also update active_group_id so all API routes use the impersonated group
  cookieStore.set('active_group_id', group_id, {
    httpOnly: false,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   60 * 60 * 2,
  })

  return NextResponse.json({ data: { group_id, group_name: (group as { id: string; name: string }).name } })
}

// ─── DELETE /api/admin/impersonate ────────────────────────────────────────────
// Clears the impersonation cookie and restores the user's default group.
export async function DELETE() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore = cookies()
  cookieStore.delete(IMPERSONATE_COOKIE)

  // Restore active_group_id to user's default group
  const admin = createAdminClient()
  const { data: defaultGroup } = await admin
    .from('user_groups')
    .select('group_id')
    .eq('user_id', session.user.id)
    .eq('is_default', true)
    .single()

  if (defaultGroup) {
    cookieStore.set('active_group_id', (defaultGroup as { group_id: string }).group_id, {
      httpOnly: false,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   60 * 60 * 24 * 30,
    })
  }

  return NextResponse.json({ data: { cleared: true } })
}
