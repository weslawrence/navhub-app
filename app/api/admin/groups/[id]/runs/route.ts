import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET /api/admin/groups/[id]/runs ──────────────────────────────────────────
// Returns recent agent runs for a group (super admin only).
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin   = createAdminClient()
  const groupId = params.id

  const { data: sa } = await admin
    .from('user_groups').select('role').eq('user_id', session.user.id).eq('role', 'super_admin')
  if (!sa || sa.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url   = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 100)

  const { data: runRows } = await admin
    .from('agent_runs')
    .select('id, run_name, status, tokens_used, created_at, agent_id')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Enrich with agent names via a separate query (same pattern as the activity route)
  const agentIds = Array.from(new Set((runRows ?? []).map((r: { agent_id: string }) => r.agent_id)))
  const { data: agentRows } = await admin
    .from('agents')
    .select('id, name')
    .in('id', agentIds.length > 0 ? agentIds : ['x'])

  const agentMap = Object.fromEntries(
    (agentRows ?? []).map((a: { id: string; name: string }) => [a.id, a.name])
  )

  const result = (runRows ?? []).map((r: {
    id: string; run_name: string | null; status: string
    tokens_used: number | null; created_at: string; agent_id: string
  }) => ({
    id:          r.id,
    run_name:    r.run_name,
    status:      r.status,
    tokens_used: r.tokens_used,
    created_at:  r.created_at,
    agent_name:  agentMap[r.agent_id] ?? 'Unknown',
  }))

  return NextResponse.json({ data: result })
}
