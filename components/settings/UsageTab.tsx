'use client'

import { useEffect, useState } from 'react'
import { BarChart2, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface AgentBucket    { agent_id: string; agent_name: string; tokens: number; cost_usd: number; run_count: number }
interface TierBucket     { tier: string; tokens: number; cost_usd: number; run_count: number }
interface PeriodBucket   { tokens: number; cost_usd: number; run_count: number }

interface ProfessionalSavings {
  runs_in_professional:        number
  actual_cost_usd:             number
  traditional_estimate_usd:    number
  traditional_hourly_rate_usd: number
  savings_usd:                 number
}

interface UsageData {
  totals:                PeriodBucket
  last_30_days:          PeriodBucket
  this_month:            PeriodBucket
  by_agent:              AgentBucket[]
  by_complexity:         TierBucket[]
  professional_savings?: ProfessionalSavings
}

const TIER_LABELS: Record<string, { emoji: string; label: string }> = {
  standard:     { emoji: '☕',  label: 'Medium job — stay frugal' },
  medium:       { emoji: '💪',  label: 'Big job — conserve where you can' },
  large:        { emoji: '🏋️', label: "You've got your work cut out" },
  massive:      { emoji: '🔥',  label: 'Open the throttle' },
  professional: { emoji: '⚡',  label: 'Professional — full capability' },
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString()
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return '< $0.01'
  return `$${usd.toFixed(2)}`
}

export default function UsageTab() {
  const [data,    setData]    = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/settings/token-usage')
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json.error) setError(json.error)
        else            setData(json.data as UsageData)
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading usage…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-300">
        {error}
      </div>
    )
  }

  if (!data) return null

  const maxAgentTokens = Math.max(1, ...data.by_agent.map(a => a.tokens))
  const maxTierTokens  = Math.max(1, ...data.by_complexity.map(t => t.tokens))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <BarChart2 className="h-4 w-4" /> Token usage & cost
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Estimated based on completed agent runs in this group. Costs are approximate — see your AI provider invoice for exact figures.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="This month"    bucket={data.this_month} />
        <SummaryCard label="Last 30 days"  bucket={data.last_30_days} />
        <SummaryCard label="All time"      bucket={data.totals} />
      </div>

      {/* Professional savings */}
      {data.professional_savings && data.professional_savings.runs_in_professional > 0 && (
        <Card className="border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
          <CardContent className="pt-5 space-y-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span>⚡</span> Professional savings estimate
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Professional runs</p>
                <p className="text-xl font-semibold text-foreground tabular-nums">{data.professional_savings.runs_in_professional}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">NavHub cost</p>
                <p className="text-xl font-semibold text-foreground tabular-nums">{fmtCost(data.professional_savings.actual_cost_usd)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Traditional cost (est.)</p>
                <p className="text-xl font-semibold text-foreground tabular-nums">{fmtCost(data.professional_savings.traditional_estimate_usd)}</p>
              </div>
            </div>
            <div className="pt-2 border-t border-blue-200 dark:border-blue-900">
              <p className="text-xs text-muted-foreground">Estimated savings</p>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">
                {fmtCost(data.professional_savings.savings_usd)}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Comparison uses a notional ${data.professional_savings.traditional_hourly_rate_usd}/hr professional-firm rate as a stand-in for one billable hour per run.
              Actual savings vary depending on the complexity of the work being replaced.
            </p>
          </CardContent>
        </Card>
      )}

      {/* By complexity tier */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">By job size</h3>
          {data.by_complexity.every(t => t.run_count === 0) ? (
            <p className="text-xs text-muted-foreground">No completed runs yet.</p>
          ) : (
            <div className="space-y-2">
              {data.by_complexity.map(t => {
                const meta = TIER_LABELS[t.tier] ?? { emoji: '·', label: t.tier }
                const pct  = (t.tokens / maxTierTokens) * 100
                return (
                  <div key={t.tier} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground flex items-center gap-1.5">
                        <span>{meta.emoji}</span>
                        <span>{meta.label}</span>
                        <span className="text-muted-foreground">· {t.run_count} run{t.run_count === 1 ? '' : 's'}</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {fmtTokens(t.tokens)} · {fmtCost(t.cost_usd)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* By agent */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Top agents</h3>
          {data.by_agent.length === 0 ? (
            <p className="text-xs text-muted-foreground">No completed runs yet.</p>
          ) : (
            <div className="space-y-2">
              {data.by_agent.map(a => {
                const pct = (a.tokens / maxAgentTokens) * 100
                return (
                  <div key={a.agent_id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground truncate flex-1 mr-3">
                        {a.agent_name}
                        <span className="text-muted-foreground ml-1.5">· {a.run_count} run{a.run_count === 1 ? '' : 's'}</span>
                      </span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {fmtTokens(a.tokens)} · {fmtCost(a.cost_usd)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground pt-1">
            Showing top {data.by_agent.length} agents by token consumption.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryCard({ label, bucket }: { label: string; bucket: PeriodBucket }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold text-foreground mt-1 tabular-nums">{fmtTokens(bucket.tokens)} <span className="text-xs text-muted-foreground font-normal">tokens</span></p>
        <p className="text-sm text-foreground mt-0.5 tabular-nums">{fmtCost(bucket.cost_usd)} <span className="text-xs text-muted-foreground">est.</span></p>
        <p className="text-[11px] text-muted-foreground mt-1">{bucket.run_count} run{bucket.run_count === 1 ? '' : 's'}</p>
      </CardContent>
    </Card>
  )
}
