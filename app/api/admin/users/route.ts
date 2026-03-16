import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
// Returns all platform users (from auth.users) enriched with group memberships.
// Requires caller to be super_admin in at least one group.
export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()

  // Verify caller is super_admin
  const { data: memberships } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('role', 'super_admin')

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // List all users from auth (up to 1000 — acceptable for platform scale)
  const { data: { users }, error: authError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  // Fetch all group memberships joined with group names
  const { data: allMemberships } = await admin
    .from('user_groups')
    .select('user_id, group_id, role, group:groups(name)')

  type MembershipRow = {
    user_id:  string
    group_id: string
    role:     string
    // Supabase returns the joined table as array for to-one relations via the JS client
    group:    { name: string }[] | { name: string } | null
  }

  // Build map: user_id → array of group memberships
  const memberMap: Record<string, { group_id: string; group_name: string; role: string }[]> = {}
  for (const m of (allMemberships ?? []) as unknown as MembershipRow[]) {
    if (!memberMap[m.user_id]) memberMap[m.user_id] = []
    // Handle Supabase returning joined record as object or single-element array
    const groupName = Array.isArray(m.group)
      ? (m.group[0]?.name ?? m.group_id)
      : (m.group?.name ?? m.group_id)
    memberMap[m.user_id].push({
      group_id:   m.group_id,
      group_name: groupName,
      role:       m.role,
    })
  }

  const data = users.map(u => ({
    id:              u.id,
    email:           u.email ?? '',
    created_at:      u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    groups:          memberMap[u.id] ?? [],
  }))

  return NextResponse.json({ data })
}
