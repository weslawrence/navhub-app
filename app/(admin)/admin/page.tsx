import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

const STATUS_BADGE: Record<string, string> = {
  queued:    'bg-zinc-700 text-zinc-300',
  running:   'bg-blue-900 text-blue-300',
  success:   'bg-green-900 text-green-300',
  error:     'bg-red-900 text-red-300',
  cancelled: 'bg-amber-900 text-amber-300',
}

const TIER_BADGE: Record<string, string> = {
  starter:    'bg-zinc-700 text-zinc-300',
  pro:        'bg-blue-900/60 text-blue-300',
  enterprise: 'bg-amber-900/60 text-amber-300',
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

  // ── Groups at a glance (with subscription fields) ────────────────────────────
  const { data: allGroups } = await admin
    .from('groups')
    .select('id, name, slug, palette_id, created_at, subscription_tier, token_usage_mtd, token_limit_mtd, is_active')
    .order('created_at', { ascending: false })

  type GroupRow = {
    id: string; name: string; slug: string | null; palette_id: string | null; created_at: string
    subscription_tier: string; token_usage_mtd: number; token_limit_mtd: number; is_active: boolean
  }

  const allGroupIds = (allGroups ?? []).map((g: { id: string }) => g.id)

  const [{ data: companyCounts }, { data: memberCounts }, { data: lastRuns }] = await Promise.all([
    admin.from('companies').select('group_id').eq('is_active', true).in('group_id', allGroupIds.length > 0 ? allGroupIds : ['x']),
    admin.from('user_groups').select('group_id').in('group_id', allGroupIds.length > 0 ? allGroupIds : ['x']),
    admin.from('agent_runs').select('group_id, created_at').in('group_id', allGroupIds.length > 0 ? allGroupIds : ['x']).order('created_at', { ascending: false }).limit(1000),
  ])

  const compByGroup   = (companyCounts ?? []).reduce((m: Record<string, number>, r: { group_id: string }) => { m[r.group_id] = (m[r.group_id] ?? 0) + 1; return m }, {} as Record<string, number>)
  const memberByGroup = (memberCounts ?? []).reduce((m: Record<string, number>, r: { group_id: string }) => { m[r.group_id] = (m[r.group_id] ?? 0) + 1; return m }, {} as Record<string, number>)
  const lastRunByGroup: Record<string, string> = {}
  for (const r of (lastRuns ?? []) as Array<{ group_id: string; created_at: string }>) {
    if (!lastRunByGroup[r.group_id]) lastRunByGroup[r.group_id] = r.created_at
  }

  // ── Platform token totals ────────────────────────────────────────────────────
  const totalTokensMTD  = (allGroups ?? []).reduce((s: number, g: { token_usage_mtd: number }) => s + (g.token_usage_mtd ?? 0), 0)
  const totalTokenLimit = (allGroups ?? []).reduce((s: number, g: { token_limit_mtd: number }) => s + (g.token_limit_mtd ?? 0), 0)
  const tokenPct        = totalTokenLimit > 0 ? Math.min(100, (totalTokensMTD / totalTokenLimit) * 100) : 0
  const tokenBarColour  = tokenPct >= 90 ? 'bg-red-500' : tokenPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'

  const statCards = [
    { label: 'Total Groups',     value: groupCount   ?? 0 },
    { label: 'Active Companies', value: companyCount ?? 0 },
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

      {/* Platform Token Usage MTD */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Platform Tokens MTD</p>
            <p className="text-sm text-zinc-300 mt-0.5">
              {(totalTokensMTD / 1_000_000).toFixed(2)}M used ·{' '}
              {(totalTokenLimit / 1_000_000).toFixed(1)}M combined limit ·{' '}
              <span className={tokenPct >= 90 ? 'text-red-400' : tokenPct >= 70 ? 'text-amber-400' : 'text-zinc-400'}>
                {tokenPct.toFixed(0)}% utilised
              </span>
            </p>
          </div>
          <Link
            href="/admin/groups"
            className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1 rounded transition-colors"
          >
            View Groups
          </Link>
        </div>
        <div className="h-2.5 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${tokenBarColour}`}
            style={{ width: `${tokenPct.toFixed(1)}%` }}
          />
        </div>
        {/* Per-group mini breakdown */}
        {(allGroups ?? []).length > 0 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {(allGroups as GroupRow[]).slice(0, 6).map(g => {
              const pct    = g.token_limit_mtd > 0 ? Math.min(100, (g.token_usage_mtd / g.token_limit_mtd) * 100) : 0
              const colour = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
              return (
                <Link key={g.id} href={`/admin/groups/${g.id}`} className="flex items-center gap-2 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-400 truncate group-hover:text-white transition-colors">{g.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-1 shrink-0 ${TIER_BADGE[g.subscription_tier] ?? TIER_BADGE.starter}`}>
                        {g.subscription_tier}
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct.toFixed(1)}%` }} />
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
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
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Groups</h2>
            <Link href="/admin/groups" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-zinc-800">
            {(allGroups ?? []).length === 0 && (
              <p className="px-5 py-4 text-sm text-zinc-500">No groups yet.</p>
            )}
            {(allGroups as GroupRow[] ?? []).map(g => (
              <div key={g.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white truncate">{g.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${TIER_BADGE[g.subscription_tier] ?? TIER_BADGE.starter}`}>
                      {g.subscription_tier}
                    </span>
                    {!g.is_active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400 shrink-0">inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {compByGroup[g.id] ?? 0} co · {memberByGroup[g.id] ?? 0} users
                    {lastRunByGroup[g.id] && ` · last run ${fmtDate(lastRunByGroup[g.id])}`}
                  </p>
                </div>
                <Link
                  href={`/admin/groups/${g.id}`}
                  className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1 rounded transition-colors shrink-0"
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
