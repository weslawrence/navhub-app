import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET /api/admin/groups/[id]/activity ─────────────────────────────────────
export async function GET(
  _req: Request,
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

  const [
    { data: runRows },
    { data: reportRows },
    { data: docRows },
    { data: snapRows },
  ] = await Promise.all([
    admin.from('agent_runs')
      .select('id, status, created_at, started_at, completed_at, agent_id, tokens_used')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('custom_reports')
      .select('id, name, created_at')
      .eq('group_id', groupId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(10),
    admin.from('documents')
      .select('id, title, document_type, created_at')
      .eq('group_id', groupId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(10),
    admin.from('cashflow_snapshots')
      .select('id, name, created_at, company_id')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // Enrich runs with agent names
  const agentIds = Array.from(new Set((runRows ?? []).map((r: { agent_id: string }) => r.agent_id)))
  const { data: agentRows } = await admin
    .from('agents')
    .select('id, name')
    .in('id', agentIds.length > 0 ? agentIds : ['x'])

  const agentMap = Object.fromEntries(
    (agentRows ?? []).map((a: { id: string; name: string }) => [a.id, a.name])
  )

  const runs = (runRows ?? []).map((r: {
    id: string; status: string; created_at: string; started_at: string | null
    completed_at: string | null; agent_id: string; tokens_used: number | null
  }) => ({
    ...r,
    agent_name: agentMap[r.agent_id] ?? null,
  }))

  // Filter cashflow snapshots by company_ids belonging to this group
  const { data: groupCompanies } = await admin
    .from('companies').select('id').eq('group_id', groupId)
  const companyIdSet = new Set((groupCompanies ?? []).map((c: { id: string }) => c.id))
  const snapshots = (snapRows ?? []).filter((s: { company_id: string }) => companyIdSet.has(s.company_id))

  return NextResponse.json({
    data: {
      runs,
      reports:   reportRows  ?? [],
      documents: docRows     ?? [],
      snapshots,
    },
  })
}
