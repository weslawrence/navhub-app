import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

const STATUS_BADGE: Record<string, string> = {
  queued:    'bg-zinc-700 text-zinc-300',
  running:   'bg-blue-900 text-blue-300',
  success:   'bg-green-900 text-green-300',
  error:     'bg-red-900 text-red-300',
  cancelled: 'bg-amber-900 text-amber-300',
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default async function AdminDashboard() {
  const admin = createAdminClient()

  // ── Stat counts ─────────────────────────────────────────────────────────────
  const [
    { count: groupCount   },
    { count: companyCount },
    { count: runCount     },
  ] = await Promise.all([
    admin.from('groups').select('*', { count: 'exact', head: true }),
    admin.from('companies').select('*', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('agent_runs').select('*', { count: 'exact', head: true }),
  ])

  const { count: userCount } = await admin
    .from('user_groups')
    .select('user_id', { count: 'exact', head: true })

  // ── Recent agent runs ────────────────────────────────────────────────────────
  const { data: recentRuns } = await admin
    .from('agent_runs')
    .select('id, status, created_at, started_at, completed_at, agent_id, group_id')
    .order('created_at', { ascending: false })
    .limit(10)

  // Enrich with agent + group names
  const agentIds = Array.from(new Set((recentRuns ?? []).map((r: { agent_id: string }) => r.agent_id)))
  const groupIds = Array.from(new Set((recentRuns ?? []).map((r: { group_id: string }) => r.group_id)))

  const [{ data: agents }, { data: groups }] = await Promise.all([
    admin.from('agents').select('id, name').in('id', agentIds.length > 0 ? agentIds : ['00000000-0000-0000-0000-000000000000']),
    admin.from('groups').select('id, name').in('id', groupIds.length > 0 ? groupIds : ['00000000-0000-0000-0000-000000000000']),
  ])

  const agentMap = Object.fromEntries((agents ?? []).map((a: { id: string; name: string }) => [a.id, a.name]))
  const groupMap = Object.fromEntries((groups ?? []).map((g: { id: string; name: string }) => [g.id, g.name]))

  // ── Groups at a glance ───────────────────────────────────────────────────────
  const { data: allGroups } = await admin
    .from('groups')
    .select('id, name, slug, palette_id, created_at')
    .order('created_at', { ascending: false })

  const allGroupIds = (allGroups ?? []).map((g: { id: string }) => g.id)

  const [{ data: companyCounts }, { data: memberCounts }, { data: lastRuns }] = await Promise.all([
    admin.from('companies').select('group_id').eq('is_active', true).in('group_id', allGroupIds.length > 0 ? allGroupIds : ['x']),
    admin.from('user_groups').select('group_id').in('group_id', allGroupIds.length > 0 ? allGroupIds : ['x']),
    admin.from('agent_runs').select('group_id, created_at').in('group_id', allGroupIds.length > 0 ? allGroupIds : ['x']).order('created_at', { ascending: false }).limit(1000),
  ])

  const compByGroup  = (companyCounts ?? []).reduce((m: Record<string, number>, r: { group_id: string }) => { m[r.group_id] = (m[r.group_id] ?? 0) + 1; return m }, {})
  const memberByGroup = (memberCounts ?? []).reduce((m: Record<string, number>, r: { group_id: string }) => { m[r.group_id] = (m[r.group_id] ?? 0) + 1; return m }, {})
  const lastRunByGroup: Record<string, string> = {}
  for (const r of (lastRuns ?? []) as Array<{ group_id: string; created_at: string }>) {
    if (!lastRunByGroup[r.group_id]) lastRunByGroup[r.group_id] = r.created_at
  }

  const statCards = [
    { label: 'Total Groups',     value: groupCount   ?? 0 },
    { label: 'Total Companies',  value: companyCount ?? 0 },
    { label: 'Total Users',      value: userCount    ?? 0 },
    { label: 'Total Agent Runs', value: runCount     ?? 0 },
  ]

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Dashboard</h1>
        <p className="text-zinc-400 text-sm mt-1">Overview of all groups, users, and activity across NavHub.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
            <p className="text-3xl font-bold text-white mt-1">{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Activity */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-white">Recent Agent Runs</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {(recentRuns ?? []).length === 0 && (
              <p className="px-5 py-4 text-sm text-zinc-500">No runs yet.</p>
            )}
            {(recentRuns ?? []).map((run: {
              id: string; status: string; created_at: string
              started_at: string | null; completed_at: string | null
              agent_id: string; group_id: string
            }) => {
              const durationMs = run.started_at && run.completed_at
                ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
                : null
              const dur = durationMs !== null ? `${Math.round(durationMs / 1000)}s` : null

              return (
                <Link
                  key={run.id}
                  href={`/admin/agent-runs/${run.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{agentMap[run.agent_id] ?? 'Unknown agent'}</p>
                    <p className="text-xs text-zinc-500 truncate">{groupMap[run.group_id] ?? run.group_id} · {fmtDate(run.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {dur && <span className="text-xs text-zinc-500">{dur}</span>}
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[run.status] ?? STATUS_BADGE.queued}`}>
                      {run.status}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Groups at a glance */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-white">Groups</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {(allGroups ?? []).length === 0 && (
              <p className="px-5 py-4 text-sm text-zinc-500">No groups yet.</p>
            )}
            {(allGroups ?? []).map((g: { id: string; name: string; slug: string }) => (
              <div key={g.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{g.name}</p>
                  <p className="text-xs text-zinc-500">
                    {compByGroup[g.id] ?? 0} co · {memberByGroup[g.id] ?? 0} users
                    {lastRunByGroup[g.id] && ` · last run ${fmtDate(lastRunByGroup[g.id])}`}
                  </p>
                </div>
                <Link
                  href={`/admin/groups/${g.id}`}
                  className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1 rounded transition-colors"
                >
                  View
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
