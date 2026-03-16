import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET /api/admin/groups ────────────────────────────────────────────────────
// Returns all groups with company/user counts. Super_admin only.
export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()

  // Verify super_admin
  const { data: memberships } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('role', 'super_admin')

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: groups } = await admin
    .from('groups')
    .select('id, name, slug, palette_id, created_at')
    .order('created_at', { ascending: false })

  if (!groups) return NextResponse.json({ data: [] })

  const groupIds = groups.map((g: { id: string }) => g.id)

  const [{ data: companies }, { data: members }, { data: runs }] = await Promise.all([
    admin.from('companies').select('group_id').eq('is_active', true).in('group_id', groupIds),
    admin.from('user_groups').select('group_id').in('group_id', groupIds),
    admin.from('agent_runs').select('group_id, created_at').in('group_id', groupIds).order('created_at', { ascending: false }).limit(2000),
  ])

  const compByGroup:   Record<string, number> = {}
  const memberByGroup: Record<string, number> = {}
  const lastRunByGroup: Record<string, string> = {}

  for (const c of (companies ?? []) as Array<{ group_id: string }>) {
    compByGroup[c.group_id] = (compByGroup[c.group_id] ?? 0) + 1
  }
  for (const m of (members ?? []) as Array<{ group_id: string }>) {
    memberByGroup[m.group_id] = (memberByGroup[m.group_id] ?? 0) + 1
  }
  for (const r of (runs ?? []) as Array<{ group_id: string; created_at: string }>) {
    if (!lastRunByGroup[r.group_id]) lastRunByGroup[r.group_id] = r.created_at
  }

  const data = groups.map((g: { id: string; name: string; slug: string | null; palette_id: string | null; created_at: string }) => ({
    ...g,
    company_count: compByGroup[g.id]   ?? 0,
    user_count:    memberByGroup[g.id] ?? 0,
    last_run_at:   lastRunByGroup[g.id] ?? null,
  }))

  return NextResponse.json({ data })
}
