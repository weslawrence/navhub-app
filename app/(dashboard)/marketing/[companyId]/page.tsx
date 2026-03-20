'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link        from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react'
import { Button }  from '@/components/ui/button'
import { Badge }   from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import MetricChart from '@/components/marketing/MetricChart'
import MarketingEntryModal from '@/components/marketing/MarketingEntryModal'
import { cn }      from '@/lib/utils'
import {
  MARKETING_PLATFORM_LABELS,
  MARKETING_PLATFORM_ICONS,
  MARKETING_METRICS,
  type MarketingPlatform,
  type MarketingSnapshot,
} from '@/lib/types'

// ── Types ──────────────────────────────────────────────────────────────────

interface Company {
  id:   string
  name: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatNum(val: number, type: 'number' | 'percentage' | 'currency'): string {
  if (type === 'percentage') return `${val.toFixed(1)}%`
  if (type === 'currency') {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000)     return `$${(val / 1_000).toFixed(1)}K`
    return `$${val.toFixed(0)}`
  }
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000)     return `${(val / 1_000).toFixed(1)}K`
  return val.toLocaleString()
}

// Tab definitions
type MarketingTab = 'web' | 'social' | 'ads' | 'email'

const TABS: { id: MarketingTab; label: string; platforms: MarketingPlatform[] }[] = [
  { id: 'web',    label: 'Web',        platforms: ['ga4', 'search_console'] },
  { id: 'social', label: 'Social',     platforms: ['meta', 'linkedin'] },
  { id: 'ads',    label: 'Ads',        platforms: ['google_ads', 'meta_ads'] },
  { id: 'email',  label: 'Email & CRM', platforms: ['mailchimp', 'hubspot', 'freshsales'] },
]

function getPeriodOptions(): string[] {
  const options: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return options
}

function periodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' })
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MarketingCompanyPage({
  params,
}: {
  params: { companyId: string }
}) {
  const searchParams = useSearchParams()
  const initialPlatform = searchParams.get('platform') as MarketingPlatform | null

  const [company,        setCompany]        = useState<Company | null>(null)
  const [activeTab,      setActiveTab]      = useState<MarketingTab>(() => {
    if (!initialPlatform) return 'web'
    for (const tab of TABS) {
      if (tab.platforms.includes(initialPlatform)) return tab.id
    }
    return 'web'
  })
  const [snapshots,      setSnapshots]      = useState<MarketingSnapshot[]>([])
  const [loading,        setLoading]        = useState(true)
  const [entryModal,     setEntryModal]     = useState<MarketingPlatform | null>(null)
  const [groupId,        setGroupId]        = useState('')
  const periodOptions = getPeriodOptions()
  const [selectedPeriod, setSelectedPeriod] = useState(periodOptions[1] ?? periodOptions[0])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, gRes] = await Promise.all([
        fetch(`/api/companies/${params.companyId}`),
        fetch('/api/groups/active'),
      ])
      const cJson = await cRes.json() as { data?: Company }
      const gJson = await gRes.json() as { data?: { group?: { id: string } } }
      setCompany(cJson.data ?? null)
      setGroupId(gJson.data?.group?.id ?? '')
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [params.companyId])

  const loadSnapshots = useCallback(async () => {
    const res  = await fetch(`/api/marketing/snapshots?company_id=${params.companyId}`)
    const json = await res.json() as { data?: MarketingSnapshot[] }
    setSnapshots(json.data ?? [])
  }, [params.companyId])

  useEffect(() => {
    void load()
    void loadSnapshots()
  }, [load, loadSnapshots])

  const tabPlatforms = useMemo(() => {
    return TABS.find(t => t.id === activeTab)?.platforms ?? []
  }, [activeTab])

  // Snapshots for the selected period
  const periodSnapshots = useMemo(() => {
    const [y, m] = selectedPeriod.split('-').map(Number)
    const start  = new Date(y, m - 1, 1).toISOString().slice(0, 10)
    const end    = new Date(y, m, 0).toISOString().slice(0, 10)
    return snapshots.filter(s => s.period_start >= start && s.period_start <= end)
  }, [snapshots, selectedPeriod])

  // Chart data: last 6 periods for a platform + metric
  function chartData(platform: string, metricKey: string): { period: string; value: number }[] {
    const last6 = periodOptions.slice(0, 6)
    return last6
      .reverse()
      .map(p => {
        const [y, m] = p.split('-').map(Number)
        const startStr = new Date(y, m - 1, 1).toISOString().slice(0, 10)
        const snap = snapshots.find(
          s => s.platform === platform && s.metric_key === metricKey &&
               s.period_start >= startStr && s.period_start <= new Date(y, m, 0).toISOString().slice(0, 10)
        )
        return { period: p, value: snap?.value_number ?? 0 }
      })
      .filter(d => d.value > 0)
  }

  function getVal(platform: string, key: string): number | null {
    const snap = periodSnapshots.find(s => s.platform === platform && s.metric_key === key)
    return snap?.value_number ?? null
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 rounded-md bg-muted/40 animate-pulse" />
        <div className="h-64 rounded-xl bg-muted/30 animate-pulse" />
      </div>
    )
  }

  if (!company) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Company not found.</p>
        <Link href="/marketing" className="text-sm text-primary hover:underline mt-2 inline-block">← Back to Marketing</Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/marketing" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{company.name}</h1>
            <p className="text-sm text-muted-foreground">Marketing Performance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 pr-7 text-sm text-foreground"
          >
            {periodOptions.map(p => (
              <option key={p} value={p}>{periodLabel(p)}</option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadSnapshots()}
            className="h-8"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Platform sections */}
      {tabPlatforms.map(platform => {
        const metrics   = MARKETING_METRICS[platform]
        const hasData   = periodSnapshots.some(s => s.platform === platform)
        const chartMetric = metrics[0]

        return (
          <div key={platform} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">{MARKETING_PLATFORM_ICONS[platform]}</span>
                <h2 className="text-base font-semibold text-foreground">
                  {MARKETING_PLATFORM_LABELS[platform]}
                </h2>
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Manual entry
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEntryModal(platform)}
                className="h-8 text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Enter Data
              </Button>
            </div>

            {hasData ? (
              <>
                {/* Metric cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {metrics.map(m => {
                    const val = getVal(platform, m.key)
                    return (
                      <Card key={m.key} className="border-border">
                        <CardContent className="p-3">
                          <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
                          <p className="text-lg font-bold text-foreground">
                            {val !== null ? formatNum(val, m.type) : '—'}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{m.description}</p>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* Trend chart */}
                {chartMetric && (
                  <Card className="border-border">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-xs font-medium text-muted-foreground">
                        {chartMetric.label} — Last 6 periods
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <MetricChart
                        data={chartData(platform, chartMetric.key)}
                        metricLabel={chartMetric.label}
                        metricType={chartMetric.type}
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card className="border-border border-dashed">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-2">
                  <p className="text-sm text-muted-foreground">No data for {periodLabel(selectedPeriod)}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEntryModal(platform)}
                    className="text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add manually
                  </Button>
                </CardContent>
              </Card>
            )}

            {tabPlatforms.indexOf(platform) < tabPlatforms.length - 1 && (
              <hr className="border-border" />
            )}
          </div>
        )
      })}

      {/* Entry Modal */}
      {entryModal && (
        <MarketingEntryModal
          platform={entryModal}
          companyId={params.companyId}
          groupId={groupId}
          onSave={() => void loadSnapshots()}
          onClose={() => setEntryModal(null)}
        />
      )}
    </div>
  )
}
