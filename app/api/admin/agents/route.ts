import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

// ─── GET /api/admin/agents ────────────────────────────────────────────────────
// Returns all agents across all groups with run stats.
export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // All agents + group join
  const { data: agents, error } = await admin
    .from('agents')
    .select('id, name, model, tools, group_id, is_active, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!agents || agents.length === 0) return NextResponse.json({ data: [] })

  const groupIds  = Array.from(new Set(agents.map((a: { group_id: string }) => a.group_id)))
  const agentIds  = agents.map((a: { id: string }) => a.id)
  const ZERO      = '00000000-0000-0000-0000-000000000000'

  const [{ data: groups }, { data: runs }] = await Promise.all([
    admin.from('groups').select('id, name').in('id', groupIds.length > 0 ? groupIds : [ZERO]),
    admin.from('agent_runs')
      .select('agent_id, tokens_used, created_at')
      .in('agent_id', agentIds.length > 0 ? agentIds : [ZERO])
      .order('created_at', { ascending: false }),
  ])

  const groupMap = Object.fromEntries(
    (groups ?? []).map((g: { id: string; name: string }) => [g.id, g.name])
  )

  // Aggregate run stats per agent
  type RunRaw = { agent_id: string; tokens_used: number | null; created_at: string }
  const runStats: Record<string, { run_count: number; total_tokens: number; last_run_at: string | null }> = {}

  for (const r of (runs ?? []) as RunRaw[]) {
    if (!runStats[r.agent_id]) runStats[r.agent_id] = { run_count: 0, total_tokens: 0, last_run_at: null }
    runStats[r.agent_id].run_count++
    runStats[r.agent_id].total_tokens += r.tokens_used ?? 0
    if (!runStats[r.agent_id].last_run_at) runStats[r.agent_id].last_run_at = r.created_at
  }

  type AgentRaw = { id: string; name: string; model: string; tools: string[] | null; group_id: string; is_active: boolean; created_at: string }

  const data = (agents as AgentRaw[]).map(a => ({
    id:           a.id,
    name:         a.name,
    model:        a.model,
    tools_count:  (a.tools ?? []).length,
    group_id:     a.group_id,
    group_name:   groupMap[a.group_id] ?? 'Unknown',
    is_active:    a.is_active,
    created_at:   a.created_at,
    run_count:    runStats[a.id]?.run_count   ?? 0,
    total_tokens: runStats[a.id]?.total_tokens ?? 0,
    last_run_at:  runStats[a.id]?.last_run_at  ?? null,
  }))

  return NextResponse.json({ data })
}
