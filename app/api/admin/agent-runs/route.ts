import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET /api/admin/agent-runs ────────────────────────────────────────────────
// Returns paginated agent runs across all groups.
// Requires caller to be super_admin.
export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()

  const { data: memberships } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('role', 'super_admin')

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page   = Math.max(1, parseInt(searchParams.get('page')   ?? '1'))
  const limit  = 50
  const offset = (page - 1) * limit
  const status = searchParams.get('status') // optional: queued|running|success|error

  let query = admin
    .from('agent_runs')
    .select('id, status, created_at, started_at, completed_at, agent_id, group_id, tokens_used', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: runs, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with agent + group names
  const agentIds = Array.from(new Set((runs ?? []).map((r: { agent_id: string }) => r.agent_id)))
  const groupIds = Array.from(new Set((runs ?? []).map((r: { group_id: string }) => r.group_id)))
  const ZERO_ID  = '00000000-0000-0000-0000-000000000000'

  const [{ data: agents }, { data: groups }] = await Promise.all([
    admin.from('agents').select('id, name').in('id', agentIds.length > 0 ? agentIds : [ZERO_ID]),
    admin.from('groups').select('id, name').in('id', groupIds.length > 0 ? groupIds : [ZERO_ID]),
  ])

  const agentMap = Object.fromEntries((agents ?? []).map((a: { id: string; name: string }) => [a.id, a.name]))
  const groupMap = Object.fromEntries((groups ?? []).map((g: { id: string; name: string }) => [g.id, g.name]))

  type RunRow = {
    id: string; status: string; created_at: string
    started_at: string | null; completed_at: string | null
    agent_id: string; group_id: string; tokens_used: number | null
  }

  const data = (runs ?? []).map((r: RunRow) => {
    const durationMs = r.started_at && r.completed_at
      ? new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()
      : null
    return {
      id:          r.id,
      status:      r.status,
      created_at:  r.created_at,
      duration_s:  durationMs !== null ? Math.round(durationMs / 1000) : null,
      tokens_used: r.tokens_used,
      agent_id:    r.agent_id,
      agent_name:  agentMap[r.agent_id] ?? 'Unknown',
      group_id:    r.group_id,
      group_name:  groupMap[r.group_id] ?? 'Unknown',
    }
  })

  return NextResponse.json({ data, total: count ?? 0, page, limit })
}
