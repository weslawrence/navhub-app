import { NextResponse }      from 'next/server'
import { cookies }            from 'next/headers'
import { createClient }       from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// Cost per 1k input+output tokens in USD. Approximations — kept here so the
// Usage tab can render an estimate without shipping a billing dependency.
const COST_PER_1K_TOKENS: Record<string, number> = {
  'claude-haiku-4-5-20251001':     0.00025,
  'claude-haiku-4-5':              0.00025,
  'claude-sonnet-4-6':             0.003,
  'claude-sonnet-4-5-20250929':    0.003,
  'claude-sonnet-4-5':             0.003,
  'claude-opus-4-6':               0.015,
  'claude-opus-4-5':               0.015,
  'gpt-4o':                        0.005,
  'gpt-4o-mini':                   0.00015,
}
const FALLBACK_COST_PER_1K = 0.003   // default to Sonnet pricing if model unrecognised

function costForRun(model: string | null, tokens: number): number {
  const rate: number = model && COST_PER_1K_TOKENS[model] !== undefined
    ? COST_PER_1K_TOKENS[model]
    : FALLBACK_COST_PER_1K
  return (tokens / 1000) * rate
}

// ─── GET /api/settings/token-usage ───────────────────────────────────────────
// Returns aggregated token usage for the active group, broken out by:
//   • totals (overall + 30-day + this calendar month)
//   • per agent (top consumers)
//   • per task_complexity tier
// Each bucket includes a USD cost estimate using COST_PER_1K_TOKENS.
//
// Response shape:
//   { data: {
//       totals:       { tokens, cost_usd, run_count },
//       last_30_days: { tokens, cost_usd, run_count },
//       this_month:   { tokens, cost_usd, run_count },
//       by_agent:     { agent_id, agent_name, tokens, cost_usd, run_count }[],
//       by_complexity:{ tier, tokens, cost_usd, run_count }[],
//     } }
export async function GET() {
  const supabase    = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session)        return NextResponse.json({ error: 'Unauthorised'    }, { status: 401 })
  if (!activeGroupId)  return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()

  // Pull all completed runs for the group with token usage.
  const { data: runs, error } = await admin
    .from('agent_runs')
    .select('id, agent_id, model_used, tokens_used, task_complexity, started_at, created_at')
    .eq('group_id', activeGroupId)
    .not('tokens_used', 'is', null)
    .gt('tokens_used', 0)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type RunRow = {
    id:               string
    agent_id:         string
    model_used:       string | null
    tokens_used:      number
    task_complexity:  string | null
    started_at:       string | null
    created_at:       string
  }
  const rows = (runs ?? []) as RunRow[]

  // Resolve agent names in one fetch.
  const agentIds  = Array.from(new Set(rows.map(r => r.agent_id)))
  const agentMap: Record<string, string> = {}
  if (agentIds.length > 0) {
    const { data: agents } = await admin
      .from('agents')
      .select('id, name')
      .in('id', agentIds)
    for (const a of (agents ?? []) as { id: string; name: string }[]) {
      agentMap[a.id] = a.name
    }
  }

  const now = Date.now()
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const monthStartMs = monthStart.getTime()

  let totalTokens   = 0; let totalCost   = 0; let totalRuns   = 0
  let last30Tokens  = 0; let last30Cost  = 0; let last30Runs  = 0
  let monthTokens   = 0; let monthCost   = 0; let monthRuns   = 0

  const byAgent: Record<string, { agent_id: string; agent_name: string; tokens: number; cost_usd: number; run_count: number }> = {}
  const byTier:  Record<string, { tier: string; tokens: number; cost_usd: number; run_count: number }> = {
    standard:     { tier: 'standard',     tokens: 0, cost_usd: 0, run_count: 0 },
    medium:       { tier: 'medium',       tokens: 0, cost_usd: 0, run_count: 0 },
    large:        { tier: 'large',        tokens: 0, cost_usd: 0, run_count: 0 },
    massive:      { tier: 'massive',      tokens: 0, cost_usd: 0, run_count: 0 },
    professional: { tier: 'professional', tokens: 0, cost_usd: 0, run_count: 0 },
  }

  for (const r of rows) {
    const tokens = r.tokens_used
    const cost   = costForRun(r.model_used, tokens)
    const ts     = new Date(r.created_at).getTime()

    totalTokens += tokens; totalCost += cost; totalRuns += 1
    if (now - ts <= THIRTY_DAYS_MS)  { last30Tokens += tokens; last30Cost += cost; last30Runs += 1 }
    if (ts >= monthStartMs)          { monthTokens  += tokens; monthCost  += cost; monthRuns  += 1 }

    if (!byAgent[r.agent_id]) {
      byAgent[r.agent_id] = {
        agent_id:   r.agent_id,
        agent_name: agentMap[r.agent_id] ?? 'Deleted agent',
        tokens:     0, cost_usd: 0, run_count: 0,
      }
    }
    byAgent[r.agent_id].tokens   += tokens
    byAgent[r.agent_id].cost_usd += cost
    byAgent[r.agent_id].run_count += 1

    const tier = (r.task_complexity ?? 'standard') as keyof typeof byTier
    if (byTier[tier]) {
      byTier[tier].tokens    += tokens
      byTier[tier].cost_usd  += cost
      byTier[tier].run_count += 1
    }
  }

  const byAgentSorted = Object.values(byAgent)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 25)

  // Professional savings — compares actual NavHub cost to a notional
  // professional-firm hourly rate. $150/hr is a conservative midpoint for
  // the kind of work professional-tier runs replace (deep document review,
  // long structured outputs, multi-document analysis). Billing always shows
  // the actual NavHub cost; this number is the "what you'd pay otherwise"
  // estimate that headlines the savings card.
  const PROFESSIONAL_HOURLY_RATE_USD = 150
  const proRuns = byTier.professional.run_count
  const proCost = byTier.professional.cost_usd
  const traditionalEstimate = proRuns * PROFESSIONAL_HOURLY_RATE_USD
  const savings             = Math.max(0, traditionalEstimate - proCost)

  return NextResponse.json({
    data: {
      totals:       { tokens: totalTokens,  cost_usd: totalCost,  run_count: totalRuns  },
      last_30_days: { tokens: last30Tokens, cost_usd: last30Cost, run_count: last30Runs },
      this_month:   { tokens: monthTokens,  cost_usd: monthCost,  run_count: monthRuns  },
      by_agent:      byAgentSorted,
      by_complexity: ['standard','medium','large','massive','professional'].map(t => byTier[t]),
      professional_savings: {
        runs_in_professional:        proRuns,
        actual_cost_usd:             proCost,
        traditional_estimate_usd:    traditionalEstimate,
        traditional_hourly_rate_usd: PROFESSIONAL_HOURLY_RATE_USD,
        savings_usd:                 savings,
      },
    },
  })
}
