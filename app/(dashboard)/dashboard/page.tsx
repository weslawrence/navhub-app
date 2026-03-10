'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard,
  Banknote,
  TrendingUp,
  RefreshCw,
  Building2,
  Bot,
  AlertTriangle,
  Plug,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { DashboardCard }  from '@/components/dashboard/DashboardCard'
import { Button }         from '@/components/ui/button'
import { Badge }          from '@/components/ui/badge'
import { Separator }      from '@/components/ui/separator'
import {
  formatCurrency,
  formatPeriodLabel,
  getCurrentPeriod,
  getCurrentQuarterMonths,
  getYTDMonths,
  formatPeriod,
  cn,
} from '@/lib/utils'
import type { DashboardSummary, NumberFormat } from '@/lib/types'
import { PeriodSelector } from '@/components/ui/PeriodSelector'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserPrefs { currency: string; number_format: NumberFormat }

interface CompanyStatus {
  id:       string
  name:     string
  hasXero:  boolean
  lastSync: string | null
}

// ─── Helper: relative time ────────────────────────────────────────────────────

function relativeTime(isoDate: string | null): string {
  if (!isoDate) return 'Never'
  const diff  = Date.now() - new Date(isoDate).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 2)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days  = Math.floor(hours / 24)
  return `${days}d ago`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  bold     = false,
  divider  = false,
}: {
  label:   string
  value:   string
  bold?:   boolean
  divider?: boolean
}) {
  return (
    <>
      {divider && <Separator className="my-1" />}
      <div className={`flex items-center justify-between py-0.5 ${bold ? 'font-semibold' : ''}`}>
        <span className="text-xs text-muted-foreground truncate pr-2">{label}</span>
        <span className={`text-xs tabular-nums shrink-0 ${bold ? 'text-foreground' : 'text-muted-foreground'}`}>
          {value}
        </span>
      </div>
    </>
  )
}

function NoDataBanner({ message, linkLabel, href }: { message: string; linkLabel: string; href: string }) {
  return (
    <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 mb-3">
      <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">{message}</p>
      <Button size="sm" variant="outline" asChild className="h-7 text-xs">
        <Link href={href}>{linkLabel}</Link>
      </Button>
    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [period,    setPeriod]    = useState('month:' + getCurrentPeriod())
  const [summary,   setSummary]   = useState<DashboardSummary | null>(null)
  const [prefs,     setPrefs]     = useState<UserPrefs>({ currency: 'AUD', number_format: 'thousands' })
  const [companies, setCompanies] = useState<CompanyStatus[]>([])
  const [groupName, setGroupName] = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [syncing,   setSyncing]   = useState(false)
  const [syncMsg,   setSyncMsg]   = useState<string | null>(null)

  const currentPeriod = getCurrentPeriod()
  const isCurrentMonth = period === currentPeriod

  // ── Fetch data ──────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async (p: string) => {
    setLoading(true)
    setError(null)
    try {
      const [summaryRes, prefsRes, companiesRes, groupRes] = await Promise.all([
        fetch(`/api/dashboard/summary?period=${encodeURIComponent(p)}`),
        fetch('/api/settings'),
        fetch('/api/companies?include_inactive=false'),
        fetch('/api/groups/active'),
      ])

      const [summaryJson, prefsJson, companiesJson, groupJson] = await Promise.all([
        summaryRes.json(),
        prefsRes.json(),
        companiesRes.json(),
        groupRes.json(),
      ])

      if (!summaryRes.ok)   throw new Error(summaryJson.error ?? 'Failed to load dashboard')
      if (!prefsRes.ok)     setPrefs({ currency: 'AUD', number_format: 'thousands' })
      else                  setPrefs(prefsJson.data)

      setSummary(summaryJson.data)
      setGroupName(groupJson.data?.group?.name ?? null)

      // Build company status list with real Xero status from companies API
      setCompanies((companiesJson.data ?? []).map((c: {
        id:             string
        name:           string
        has_xero?:      boolean
        last_synced_at?: string | null
      }) => ({
        id:       c.id,
        name:     c.name,
        hasXero:  c.has_xero      ?? false,
        lastSync: c.last_synced_at ?? null,
      })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard data. Try refreshing.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll(period) }, [fetchAll, period])

  // ── Sync all ────────────────────────────────────────────────────────────────

  async function handleSyncAll() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res  = await fetch('/api/xero/sync/all', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ period }),
      })
      const json = await res.json()
      const d    = json.data
      if (d?.synced !== undefined) {
        const msg = d.errors?.length > 0
          ? `Synced ${d.synced} reports · ${d.errors.length} error(s)`
          : `Synced ${d.synced} reports`
        setSyncMsg(msg)
      } else {
        setSyncMsg('Sync complete')
      }
      // Re-fetch dashboard data for the current period
      await fetchAll(period)
    } catch {
      setSyncMsg('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const fmt = (v: number | null) => formatCurrency(v, prefs.number_format, prefs.currency)
  const ap  = summary?.app_summary
  const cp  = summary?.current_position
  const perf = summary?.performance

  const hasBalanceData = cp && (cp.cash !== null || cp.total_current_assets !== null)
  const hasPLData      = perf && (perf.ytd.revenue !== null || perf.qtd.revenue !== null)

  const qtdRange  = getCurrentQuarterMonths(period)
  const ytdRange  = getYTDMonths(period)

  function periodRangeLabel(months: string[]): string {
    if (months.length === 0) return ''
    if (months.length === 1) return formatPeriod(months[0])
    return `${formatPeriod(months[0])} – ${formatPeriod(months[months.length - 1])}`
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {groupName && (
              <span className="font-medium text-foreground">{groupName} · </span>
            )}
            Financial overview · <span className="font-medium text-foreground">{formatPeriodLabel(period)}</span>
          </p>
        </div>
        {/* Period selector + Refresh */}
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} />
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Top row: 4 equal cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

        {/* ── Card 1: App Summary ─────────────────────────────────────────── */}
        <DashboardCard
          title="NavHub Overview"
          icon={LayoutDashboard}
          isLoading={loading}
          error={error}
          footer={
            ap ? (
              <p className="text-xs text-muted-foreground">
                <Link href="/integrations" className="hover:text-primary underline-offset-2 hover:underline">
                  {ap.companies_with_xero} of {ap.company_count} companies connected to Xero
                </Link>
              </p>
            ) : null
          }
        >
          {ap && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <Link href="/companies" className="block hover:text-primary transition-colors">
                  <p className="text-2xl font-bold">{ap.company_count}</p>
                  <p className="text-xs text-muted-foreground">Companies</p>
                </Link>
              </div>
              <div>
                <Link href="/companies" className="block hover:text-primary transition-colors">
                  <p className="text-2xl font-bold">{ap.division_count}</p>
                  <p className="text-xs text-muted-foreground">Divisions</p>
                </Link>
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground/50">{ap.active_agent_count}</p>
                <p className="text-xs text-muted-foreground">
                  Agents
                  <Badge variant="secondary" className="ml-1.5 text-[9px] py-0">Soon</Badge>
                </p>
              </div>
              <div>
                <p className="text-2xl font-bold text-muted-foreground/50">{ap.alert_count}</p>
                <p className="text-xs text-muted-foreground">
                  Alerts
                  <Badge variant="secondary" className="ml-1.5 text-[9px] py-0">Soon</Badge>
                </p>
              </div>
            </div>
          )}
        </DashboardCard>

        {/* ── Card 2: Current Position ─────────────────────────────────────── */}
        <DashboardCard
          title="Current Position"
          icon={Banknote}
          subtitle={cp ? `As at ${formatPeriod(cp.as_at_period)}` : undefined}
          isLoading={loading}
          error={error}
          footer={
            cp ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Across {cp.companies_included} {cp.companies_included === 1 ? 'company' : 'companies'}
                </p>
                {cp.companies_missing_data > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {cp.companies_missing_data} {cp.companies_missing_data === 1 ? 'company' : 'companies'} missing balance sheet data ·{' '}
                    <Link href="/integrations" className="underline underline-offset-2">Connect</Link>
                  </p>
                )}
              </div>
            ) : null
          }
        >
          {cp && (
            <div className="space-y-0.5">
              {!hasBalanceData && (
                <NoDataBanner
                  message="Connect Xero to see balance sheet data"
                  linkLabel="Connect Xero"
                  href="/integrations"
                />
              )}
              <MetricRow label="Cash & Equivalents"         value={fmt(cp.cash)} />
              <MetricRow label="Accounts Receivable"        value={fmt(cp.receivables)} />
              <MetricRow label="Total Current Assets"       value={fmt(cp.total_current_assets)} bold divider />
              <MetricRow label="Total Non-Current Assets"   value={fmt(cp.total_non_current_assets)} />
              <MetricRow label="Accounts Payable"           value={fmt(cp.payables)} divider />
              <MetricRow label="Total Current Liabilities"  value={fmt(cp.total_current_liabilities)} />
              <MetricRow label="Total Non-Current Liab."    value={fmt(cp.total_non_current_liabilities)} />
              <MetricRow label="Net Position"               value={fmt(cp.net_position)} bold divider />
            </div>
          )}
        </DashboardCard>

        {/* ── Card 3: Performance ─────────────────────────────────────────── */}
        <DashboardCard
          title="Performance"
          icon={TrendingUp}
          isLoading={loading}
          error={error}
          footer={
            perf ? (
              <p className="text-xs text-muted-foreground">
                QTD {periodRangeLabel(qtdRange)} · YTD from Jul {ytdRange[0]?.split('-')[0] ?? ''}
              </p>
            ) : null
          }
        >
          {perf && (
            <div>
              {!hasPLData && (
                <NoDataBanner
                  message="Connect Xero or upload Excel to see P&L data"
                  linkLabel="Get started"
                  href="/integrations"
                />
              )}
              {/* Three-column table */}
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left text-muted-foreground font-medium pb-2 pr-2 whitespace-nowrap">Metric</th>
                      <th className="text-right text-muted-foreground font-medium pb-2 px-1 whitespace-nowrap">QTD</th>
                      <th className="text-right text-muted-foreground font-medium pb-2 px-1 whitespace-nowrap">Last Qtr</th>
                      <th className="text-right text-muted-foreground font-medium pb-2 pl-1 whitespace-nowrap">YTD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {[
                      { label: 'Revenue',        qtd: perf.qtd.revenue,            lq: perf.last_qtr.revenue,            ytd: perf.ytd.revenue },
                      { label: 'COGS',           qtd: perf.qtd.cogs,               lq: perf.last_qtr.cogs,               ytd: perf.ytd.cogs },
                      { label: 'Gross Profit',   qtd: perf.qtd.gross_profit,       lq: perf.last_qtr.gross_profit,       ytd: perf.ytd.gross_profit,  bold: true },
                      { label: 'Op. Expenses',   qtd: perf.qtd.operating_expenses, lq: perf.last_qtr.operating_expenses, ytd: perf.ytd.operating_expenses },
                      { label: 'EBITDA',         qtd: perf.qtd.ebitda,             lq: perf.last_qtr.ebitda,             ytd: perf.ytd.ebitda,        bold: true },
                    ].map(row => (
                      <tr key={row.label} className={row.bold ? 'font-semibold' : ''}>
                        <td className="py-1 pr-2 text-muted-foreground whitespace-nowrap">{row.label}</td>
                        <td className="py-1 px-1 text-right tabular-nums">{fmt(row.qtd)}</td>
                        <td className="py-1 px-1 text-right tabular-nums text-muted-foreground">{fmt(row.lq)}</td>
                        <td className="py-1 pl-1 text-right tabular-nums">{fmt(row.ytd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DashboardCard>

        {/* ── Card 4: Data Status ──────────────────────────────────────────── */}
        <DashboardCard
          title="Data Status"
          icon={RefreshCw}
          isLoading={loading}
          error={error}
          footer={
            ap ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Last sync: {relativeTime(ap.last_synced_at)}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={handleSyncAll}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1.5" />
                    )}
                    {syncing ? 'Syncing…' : 'Sync all'}
                  </Button>
                  {syncMsg && (
                    <p className="text-xs text-muted-foreground">{syncMsg}</p>
                  )}
                </div>
              </div>
            ) : null
          }
        >
          {ap && (
            <div className="space-y-2">
              {companies.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-20 text-muted-foreground">
                  <Plug className="h-6 w-6 mb-2 opacity-30" />
                  <p className="text-xs">No integrations connected yet</p>
                  <Button size="sm" variant="outline" asChild className="mt-2 h-7 text-xs">
                    <Link href="/integrations">Connect your first company</Link>
                  </Button>
                </div>
              ) : (
                companies.map(company => (
                  <div key={company.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{company.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {relativeTime(company.lastSync)}
                      </p>
                    </div>
                    {company.hasXero ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </DashboardCard>

      </div>

      {/* Quick links row */}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Link href="/companies" className="flex items-center gap-1 hover:text-primary transition-colors">
          <Building2 className="h-3.5 w-3.5" /> Companies
        </Link>
        <span>·</span>
        <Link href="/integrations" className="flex items-center gap-1 hover:text-primary transition-colors">
          <Plug className="h-3.5 w-3.5" /> Integrations
        </Link>
        <span>·</span>
        <Link href="/agents" className="flex items-center gap-1 hover:text-primary transition-colors">
          <Bot className="h-3.5 w-3.5" /> Agents <Badge variant="secondary" className="text-[9px] py-0 ml-0.5">Soon</Badge>
        </Link>
      </div>
    </div>
  )
}
