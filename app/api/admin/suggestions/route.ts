import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

// ── GET /api/admin/suggestions ──────────────────────────────────────────────
// Lists all user_suggestions with submitter email + group name resolved.
// Supports `status` filter (comma-separated; default = open statuses).
//
// Response also includes `unread_count` — count of `submitted` rows the
// admin sidebar uses for its red badge.
export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const statusParam = url.searchParams.get('status')
  const statuses = statusParam
    ? statusParam.split(',').filter(Boolean)
    : ['submitted', 'triaged', 'acknowledged', 'acting']

  const admin = createAdminClient()

  const { data: suggestions, error } = await admin
    .from('user_suggestions')
    .select('*')
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resolve submitter emails + group names so the UI doesn't need to chain
  // requests. One pass each — small lists in practice.
  const submitterIds = Array.from(new Set(((suggestions ?? []) as Array<{ submitted_by: string | null }>)
    .map(s => s.submitted_by)
    .filter((x): x is string => !!x)))
  const groupIds = Array.from(new Set(((suggestions ?? []) as Array<{ group_id: string | null }>)
    .map(s => s.group_id)
    .filter((x): x is string => !!x)))

  const emailMap: Record<string, string> = {}
  if (submitterIds.length > 0) {
    const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 })
    for (const u of userList?.users ?? []) {
      if (submitterIds.includes(u.id) && u.email) emailMap[u.id] = u.email
    }
  }

  const groupMap: Record<string, string> = {}
  if (groupIds.length > 0) {
    const { data: groups } = await admin
      .from('groups')
      .select('id, name')
      .in('id', groupIds)
    for (const g of (groups ?? []) as Array<{ id: string; name: string }>) {
      groupMap[g.id] = g.name
    }
  }

  const enriched = (suggestions ?? []).map(s => {
    const r = s as Record<string, unknown> & { submitted_by: string | null; group_id: string | null }
    return {
      ...r,
      submitter_email: r.submitted_by ? (emailMap[r.submitted_by] ?? null) : null,
      group_name:      r.group_id     ? (groupMap[r.group_id]      ?? null) : null,
    }
  })

  // Always-fresh unread count (independent of the filter param) so the
  // sidebar badge stays accurate even when the page filter is set.
  const { count: unreadCount } = await admin
    .from('user_suggestions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'submitted')

  return NextResponse.json({ data: enriched, unread_count: unreadCount ?? 0 })
}
