'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { TrendingUp, TrendingDown, Minus, BarChart2, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn }   from '@/lib/utils'
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

function getLatestPeriod(): string {
  const now = new Date()
  now.setMonth(now.getMonth() - 1)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function periodToDates(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end   = new Date(y, m, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  }
}

// Platforms grouped by category
const PLATFORM_CATEGORIES: { label: string; platforms: MarketingPlatform[] }[] = [
  { label: 'Web & Search',   platforms: ['ga4', 'search_console'] },
  { label: 'Social Media',   platforms: ['meta', 'linkedin'] },
  { label: 'Paid Ads',       platforms: ['google_ads', 'meta_ads'] },
  { label: 'Email & CRM',    platforms: ['mailchimp', 'hubspot', 'freshsales'] },
]

// Key metric to highlight per platform
const KEY_METRICS: Record<MarketingPlatform, string[]> = {
  ga4:            ['sessions', 'conversions', 'conversion_rate', 'bounce_rate'],
  search_console: ['clicks', 'impressions', 'ctr', 'avg_position'],
  meta:           ['reach', 'engagement', 'followers', 'engagement_rate'],
  linkedin:       ['impressions', 'engagement', 'followers', 'engagement_rate'],
  google_ads:     ['spend', 'clicks', 'conversions', 'roas'],
  meta_ads:       ['spend', 'reach', 'conversions', 'roas'],
  mailchimp:      ['list_size', 'open_rate', 'click_rate', 'sends'],
  hubspot:        ['total_contacts', 'new_contacts', 'deals_won', 'pipeline_value'],
  freshsales:     ['total_contacts', 'new_contacts', 'deals_won', 'pipeline_value'],
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MarketingOverviewPage() {
  const [companies,  setCompanies]  = useState<Company[]>([])
  const [snapshots,  setSnapshots]  = useState<MarketingSnapshot[]>([])
  const [loading,    setLoading]    = useState(true)
  const [period,     setPeriod]     = useState(getLatestPeriod())
  const [companyId,  setCompanyId]  = useState<string>('all')
  const [groupName,  setGroupName]  = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, gRes] = await Promise.all([
        fetch('/api/companies?include_inactive=false'),
        fetch('/api/groups/active'),
      ])
      const cJson = await cRes.json() as { data?: Company[] }
      const gJson = await gRes.json() as { data?: { group?: { name: string } } }
      setCompanies(cJson.data ?? [])
      setGroupName(gJson.data?.group?.name ?? '')
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const loadSnapshots = useCallback(async () => {
    const { start, end } = periodToDates(period)
    const params = new URLSearchParams({ from: start, to: end })
    if (companyId !== 'all') params.set('company_id', companyId)
    const res  = await fetch(`/api/marketing/snapshots?${params.toString()}`)
    const json = await res.json() as { data?: MarketingSnapshot[] }
    setSnapshots(json.data ?? [])
  }, [period, companyId])

  useEffect(() => { void loadSnapshots() }, [loadSnapshots])

  // Derive which platforms have data
  const platformsWithData = useMemo(() => {
    const platforms = new Set(snapshots.map(s => s.platform as MarketingPlatform))
    return PLATFORM_CATEGORIES
      .map(cat => ({
        ...cat,
        platforms: cat.platforms.filter(p => platforms.has(p)),
      }))
      .filter(cat => cat.platforms.length > 0)
  }, [snapshots])

  // All platforms to show (those with data + any others in their categories)
  const allCategories = useMemo(() => {
    const platformsWithDataSet = new Set(snapshots.map(s => s.platform as MarketingPlatform))
    return PLATFORM_CATEGORIES.map(cat => ({
      ...cat,
      platforms: cat.platforms.map(p => ({
        platform: p,
        hasData:  platformsWithDataSet.has(p),
      })),
    }))
  }, [snapshots])

  // Summary card values
  const summaryCards = useMemo(() => {
    function getMetricVal(platform: MarketingPlatform, key: string): number | null {
      const snap = snapshots.find(s => s.platform === platform && s.metric_key === key)
      return snap?.value_number ?? null
    }

    const sessions = ['ga4'].reduce((sum, p) => {
      const v = getMetricVal(p as MarketingPlatform, 'sessions')
      return v !== null ? sum + v : sum
    }, 0)
    const hasSessions = snapshots.some(s => s.platform === 'ga4' && s.metric_key === 'sessions')

    const reach = ['meta', 'linkedin'].reduce((sum, p) => {
      const v = getMetricVal(p as MarketingPlatform, 'reach') ?? getMetricVal(p as MarketingPlatform, 'impressions')
      return v !== null ? sum + v : sum
    }, 0)
    const hasSocial = snapshots.some(s => (s.platform === 'meta' || s.platform === 'linkedin'))

    const adSpend = ['google_ads', 'meta_ads'].reduce((sum, p) => {
      const v = getMetricVal(p as MarketingPlatform, 'spend')
      return v !== null ? sum + v : sum
    }, 0)
    const hasAds = snapshots.some(s => (s.platform === 'google_ads' || s.platform === 'meta_ads') && s.metric_key === 'spend')

    const emailList = ['mailchimp', 'hubspot', 'freshsales'].reduce((sum, p) => {
      const v = getMetricVal(p as MarketingPlatform, 'list_size') ?? getMetricVal(p as MarketingPlatform, 'total_contacts')
      return v !== null ? sum + v : sum
    }, 0)
    const hasEmail = snapshots.some(s => ['mailchimp','hubspot','freshsales'].includes(s.platform))

    return [
      { label: 'Web Traffic',  value: hasSessions ? formatNum(sessions, 'number') : null, unit: 'sessions', icon: '🌐' },
      { label: 'Social Reach', value: hasSocial ? formatNum(reach, 'number') : null, unit: 'reach + impressions', icon: '📣' },
      { label: 'Ad Spend',     value: hasAds ? formatNum(adSpend, 'currency') : null, unit: 'total spend', icon: '💰' },
      { label: 'Email List',   value: hasEmail ? formatNum(emailList, 'number') : null, unit: 'contacts', icon: '📧' },
    ]
  }, [snapshots])

  function getSnapshotVal(platform: MarketingPlatform, key: string): number | null {
    const snap = snapshots.find(s => s.platform === platform && s.metric_key === key)
    return snap?.value_number ?? null
  }

  const [year, mon] = period.split('-').map(Number)
  const periodLabel = `${new Date(year, mon - 1, 1).toLocaleString('default', { month: 'long' })} ${year}`

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 rounded-md bg-muted/40 animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-28 rounded-xl bg-muted/30 animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Marketing</h1>
          {groupName && <p className="text-sm text-muted-foreground">{groupName}</p>}
        </div>
        <div className="flex items-center gap-3">
          {/* Company filter */}
          {companies.length > 1 && (
            <select
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 pr-7 text-sm text-foreground"
            >
              <option value="all">All Companies</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {/* Period */}
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(card => (
          <Card key={card.label} className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{card.icon}</span>
                <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              </div>
              {card.value !== null ? (
                <>
                  <p className="text-2xl font-bold text-foreground">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.unit}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic">No data</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Platform sections */}
      {allCategories.map(cat => (
        <div key={cat.label}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {cat.label}
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {cat.platforms.map(({ platform, hasData }) => {
              const keyMetrics = KEY_METRICS[platform].slice(0, 4)
              const metricDefs = MARKETING_METRICS[platform]
              const targetCompanyIds = companyId === 'all'
                ? companies.map(c => c.id)
                : [companyId]
              const detailHref = targetCompanyIds.length === 1
                ? `/marketing/${targetCompanyIds[0]}?platform=${platform}`
                : `/marketing/${targetCompanyIds[0]}?platform=${platform}`

              return (
                <Card key={platform} className={cn('border-border', !hasData && 'opacity-60')}>
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{MARKETING_PLATFORM_ICONS[platform]}</span>
                        <CardTitle className="text-sm font-medium text-foreground">
                          {MARKETING_PLATFORM_LABELS[platform]}
                        </CardTitle>
                      </div>
                      {hasData && (
                        <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/5">
                          {periodLabel}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {hasData ? (
                      <>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          {keyMetrics.map(key => {
                            const def = metricDefs.find(m => m.key === key)
                            if (!def) return null
                            const val = getSnapshotVal(platform, key)
                            return (
                              <div key={key}>
                                <p className="text-xs text-muted-foreground">{def.label}</p>
                                <p className="text-sm font-semibold text-foreground">
                                  {val !== null ? formatNum(val, def.type) : '—'}
                                </p>
                              </div>
                            )
                          })}
                        </div>
                        {companies.length > 0 && (
                          <Link
                            href={detailHref}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            View details <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground italic">No data yet</p>
                        {companies.length > 0 && (
                          <Link
                            href={detailHref}
                            className="text-xs text-primary hover:underline"
                          >
                            Add manually →
                          </Link>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}

      {/* Empty state */}
      {snapshots.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-base font-medium text-foreground mb-1">No marketing data yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Select a company above and navigate to its detail page to start entering marketing data manually.
          </p>
          {companies.length > 0 && (
            <Link
              href={`/marketing/${companies[0].id}`}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Go to {companies[0].name} →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
