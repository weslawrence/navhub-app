'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Scale,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge }  from '@/components/ui/badge'
import { cn }     from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import { extractRows, getRowValue, sumGroupTotal } from '@/lib/financial'
import type { FinancialData, NumberFormat } from '@/lib/types'
import PeriodSelector from '@/components/ui/PeriodSelector'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyData {
  company_id:   string
  company_name: string
  data:         FinancialData | null
}

interface UserPrefs { number_format: NumberFormat; currency: string }

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BalanceSheetPage() {
  const [periods,     setPeriods]     = useState<string[]>([])
  const [period,      setPeriod]      = useState<string>('')
  const [mode,        setMode]        = useState<'summary' | 'detail'>('summary')
  const [companies,   setCompanies]   = useState<CompanyData[]>([])
  const [prefs,       setPrefs]       = useState<UserPrefs>({ number_format: 'thousands', currency: 'AUD' })
  const [loading,     setLoading]     = useState(true)
  const [loadingData, setLoadingData] = useState(false)
  const [syncing,     setSyncing]     = useState(false)
  const [syncMsg,     setSyncMsg]     = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)

  // ── Load available periods + prefs on mount ──────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch('/api/reports/periods').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]).then(([periodsJson, prefsJson]) => {
      const availPeriods: string[] = periodsJson.data?.periods ?? []
      setPeriods(availPeriods)
      if (availPeriods.length > 0) setPeriod('month:' + availPeriods[0])
      if (prefsJson.data) setPrefs(prefsJson.data)
    }).catch(() => {
      setError('Failed to load report data')
    }).finally(() => setLoading(false))
  }, [])

  // ── Load report data when period changes ─────────────────────────────────

  const loadData = useCallback(async (p: string) => {
    if (!p) return
    setLoadingData(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/data?type=balance_sheet&period=${encodeURIComponent(p)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load data')
      setCompanies(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (period) loadData(period)
  }, [period, loadData])

  // ── Sync handler ─────────────────────────────────────────────────────────

  async function handleSync() {
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
      setSyncMsg(d?.synced !== undefined
        ? `Synced ${d.synced} reports${d.errors?.length ? ` · ${d.errors.length} error(s)` : ''}`
        : 'Sync complete'
      )
      await loadData(period)
    } catch {
      setSyncMsg('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  // ── Build table rows ──────────────────────────────────────────────────────

  const canonicalData = companies.find(c => c.data)?.data ?? null
  const displayRows   = extractRows(canonicalData, mode)
  const hasMissingData = companies.some(c => !c.data)

  const fmt = (amount: number | null) =>
    formatCurrency(amount, prefs.number_format as 'thousands' | 'full' | 'smart', prefs.currency)

  // Summary rows that act as section dividers (bold + separator)
  const DIVIDER_ROWS = new Set([
    'Total Assets',
    'Total Liabilities',
    'Total Equity',
    'Net Assets',
  ])

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-4 bg-muted rounded w-72" />
        <div className="h-64 bg-muted rounded" />
      </div>
    )
  }

  if (periods.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Scale className="h-6 w-6" /> Balance Sheet
        </h1>
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Scale className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-sm font-medium mb-1">No financial data available</p>
          <p className="text-xs text-center max-w-xs">
            Connect Xero or upload Excel files via the Integrations page to see Balance Sheet reports.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div>
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">Balance Sheet</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Scale className="h-6 w-6" /> Balance Sheet
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period selector */}
            <PeriodSelector value={period} onChange={setPeriod} />

            {/* View mode toggle */}
            <div className="flex rounded-md border overflow-hidden">
              {(['summary', 'detail'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                    mode === m
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:bg-accent'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Sync */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleSync}
              disabled={syncing || loadingData}
            >
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Sync'}
            </Button>
          </div>
        </div>

        {syncMsg && (
          <p className="text-xs text-muted-foreground mt-1">{syncMsg}</p>
        )}
      </div>

      {/* Missing data banner */}
      {hasMissingData && !loadingData && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Some companies are missing data for this period. Sync to update.</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Report table ── */}
      {!error && (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            {loadingData ? (
              <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">
                Loading…
              </div>
            ) : displayRows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No data for this period
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap sticky left-0 bg-muted/50 min-w-[200px]">
                      Account
                    </th>
                    {companies.map(c => (
                      <th key={c.company_id} className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap min-w-[120px]">
                        {c.company_name}
                        {!c.data && (
                          <Badge variant="warning" className="ml-1.5 text-[10px]">No data</Badge>
                        )}
                      </th>
                    ))}
                    {companies.length > 1 && (
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap bg-muted/80 min-w-[120px]">
                        Group Total
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => {
                    const isSection    = row.row_type === 'section'
                    const isSummary    = row.row_type === 'summaryRow'
                    const isDivider    = isSummary && DIVIDER_ROWS.has(row.account_name)
                    const isNetAssets  = row.account_name === 'Net Assets'
                    const compAmounts  = companies.map(c => getRowValue(c.data, row.account_name))
                    const groupTotal   = sumGroupTotal(companies.map(c => c.data), row.account_name)

                    return (
                      <tr
                        key={`${row.account_name}-${i}`}
                        className={cn(
                          'border-b last:border-0',
                          isSection  ? 'bg-muted/40' : '',
                          isDivider  ? 'bg-muted/30 border-t-2 border-t-border font-semibold' : '',
                          isNetAssets ? 'bg-primary/10 font-bold' : '',
                          isSummary && !isDivider && !isNetAssets ? 'bg-muted/20 font-medium' : ''
                        )}
                      >
                        {/* Account name */}
                        <td
                          className={cn(
                            'px-4 py-2 whitespace-nowrap sticky left-0',
                            isSection
                              ? 'text-xs uppercase font-semibold tracking-wide text-muted-foreground bg-muted/40'
                              : 'text-sm',
                            isDivider    ? 'bg-muted/30' : '',
                            isNetAssets  ? 'bg-primary/10 text-primary font-bold' : '',
                            isSummary && !isDivider && !isNetAssets ? 'bg-muted/20' : '',
                            !isSection && !isSummary ? 'bg-background pl-7' : ''
                          )}
                        >
                          {row.account_name}
                        </td>

                        {/* Per-company amounts */}
                        {compAmounts.map((amount, ci) => (
                          <td
                            key={ci}
                            className={cn(
                              'px-4 py-2 text-right tabular-nums',
                              isSection ? 'text-muted-foreground text-xs' : 'text-sm',
                              amount !== null && amount < 0 ? 'text-red-600 dark:text-red-400' : '',
                              isNetAssets ? 'text-primary font-bold' : ''
                            )}
                          >
                            {isSection ? '' : fmt(amount)}
                          </td>
                        ))}

                        {/* Group Total */}
                        {companies.length > 1 && (
                          <td
                            className={cn(
                              'px-4 py-2 text-right tabular-nums bg-muted/30 font-semibold',
                              isSection ? 'text-muted-foreground text-xs' : 'text-sm',
                              groupTotal !== null && groupTotal < 0 ? 'text-red-600 dark:text-red-400' : '',
                              isNetAssets ? 'text-primary font-bold' : ''
                            )}
                          >
                            {isSection ? '' : fmt(groupTotal)}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
