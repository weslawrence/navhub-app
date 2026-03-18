'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, AlertCircle, Loader2, TrendingDown, TrendingUp, Banknote } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { Company } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ForecastSummary {
  netCashFlow:    number[]
  openingBalance: number[]
  closingBalance: number[]
}

interface CompanyForecast {
  company:  Company
  weeks:    string[]
  summary:  ForecastSummary
  currency: string
  error?:   string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number, compact = false): string {
  if (compact) {
    const abs  = Math.abs(cents / 100)
    const sign = cents < 0 ? '-' : ''
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}k`
    return `${sign}$${abs.toFixed(0)}`
  }
  return new Intl.NumberFormat('en-AU', {
    style:    'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatWeekLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
}

function cellBg(cents: number): string {
  if (cents < 0)          return 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-300'
  if (cents < 10_000_00)  return 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
  return 'bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-300'
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GroupCashflowPage() {
  const [forecasts, setForecasts] = useState<CompanyForecast[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const coRes  = await fetch('/api/companies')
        const coJson = await coRes.json()
        if (!coRes.ok) throw new Error(coJson.error ?? 'Failed to load companies')

        const companies: Company[] = (coJson.data ?? []).filter((c: Company) => c.is_active)

        if (companies.length === 0) {
          setForecasts([])
          setLoading(false)
          return
        }

        const results = await Promise.allSettled(
          companies.map(async (company): Promise<CompanyForecast> => {
            try {
              const res  = await fetch(`/api/cashflow/${company.id}/forecast`)
              const json = await res.json()
              if (!res.ok) throw new Error(json.error ?? 'Forecast unavailable')
              return {
                company,
                weeks:    json.data.weeks   as string[],
                summary:  json.data.summary as ForecastSummary,
                currency: (json.data.currency as string) ?? 'AUD',
              }
            } catch (e) {
              return {
                company,
                weeks:    [],
                summary:  { netCashFlow: [], openingBalance: [], closingBalance: [] },
                currency: 'AUD',
                error:    e instanceof Error ? e.message : 'Unknown error',
              }
            }
          })
        )

        setForecasts(
          results
            .filter((r): r is PromiseFulfilledResult<CompanyForecast> => r.status === 'fulfilled')
            .map(r => r.value)
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load group forecast')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  // ── Derived ─────────────────────────────────────────────────────────────────

  const weeks = forecasts.find(f => f.weeks.length > 0)?.weeks ?? []

  const groupClosing: number[] = weeks.map((_, i) =>
    forecasts.reduce((sum, f) => {
      if (f.error || f.summary.closingBalance[i] === undefined) return sum
      return sum + f.summary.closingBalance[i]
    }, 0)
  )

  const groupOpening  = forecasts.reduce((sum, f) => sum + (f.summary.openingBalance[0] ?? 0), 0)
  const groupNetTotal = weeks.reduce((sum, _, i) =>
    sum + forecasts.reduce((s, f) => s + (f.summary.netCashFlow[i] ?? 0), 0), 0
  )
  const lowestClose   = groupClosing.length > 0 ? Math.min(...groupClosing) : 0
  const lowestIdx     = groupClosing.indexOf(lowestClose)

  const activeCount   = forecasts.filter(f => !f.error).length
  const errorRows     = forecasts.filter(f => !!f.error)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/cashflow" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Group Cash Flow</h1>
          <p className="text-xs text-muted-foreground">
            13-week consolidated view across {activeCount}{' '}
            {activeCount === 1 ? 'company' : 'companies'}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {!loading && !error && forecasts.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground text-sm">
            No active companies.{' '}
            <Link href="/settings?tab=companies" className="underline text-foreground">
              Add a company
            </Link>{' '}
            to get started.
          </CardContent>
        </Card>
      )}

      {!loading && !error && forecasts.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Banknote className="h-3.5 w-3.5" /> Total Opening Balance
                </div>
                <p className={`text-lg font-bold ${groupOpening < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                  {formatCents(groupOpening)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Week 1 starting position</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  {groupNetTotal >= 0
                    ? <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                    : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                  Net 13-Week Cash Flow
                </div>
                <p className={`text-lg font-bold ${groupNetTotal < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {groupNetTotal >= 0 ? '+' : ''}{formatCents(groupNetTotal)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Net inflows minus outflows</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <TrendingDown className="h-3.5 w-3.5" /> Lowest Group Balance
                </div>
                <p className={`text-lg font-bold ${lowestClose < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                  {formatCents(lowestClose)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {weeks[lowestIdx] ? `Week of ${formatWeekLabel(weeks[lowestIdx])}` : '—'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Banknote className="h-3.5 w-3.5" /> Companies Tracked
                </div>
                <p className="text-lg font-bold text-foreground">{activeCount}</p>
                {errorRows.length > 0 && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                    {errorRows.length} with errors
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Per-company errors */}
          {errorRows.length > 0 && (
            <div className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Could not load forecast for: {errorRows.map(f => f.company.name).join(', ')}.
                Excluded from group totals.
              </span>
            </div>
          )}

          {/* Grid */}
          {weeks.length > 0 && (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-xs border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium text-muted-foreground min-w-[180px]">
                      Company
                    </th>
                    {weeks.map((w, i) => (
                      <th
                        key={w}
                        className={`px-2 py-2 text-right font-medium text-muted-foreground whitespace-nowrap ${i === lowestIdx ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}
                      >
                        {formatWeekLabel(w)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {forecasts.filter(f => !f.error).map(f => (
                    <tr key={f.company.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 font-medium text-foreground whitespace-nowrap">
                        <Link href={`/cashflow/${f.company.id}`} className="hover:underline text-primary">
                          {f.company.name}
                        </Link>
                      </td>
                      {weeks.map((_, i) => {
                        const val = f.summary.closingBalance[i] ?? 0
                        return (
                          <td key={i} className={`px-2 py-2 text-right font-mono whitespace-nowrap ${cellBg(val)}`}>
                            {val < 0 ? `(${formatCents(Math.abs(val), true)})` : formatCents(val, true)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}

                  {activeCount > 1 && (
                    <tr className="border-t-2 border-border bg-muted/30">
                      <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2 font-bold text-foreground uppercase text-[11px] tracking-wide whitespace-nowrap">
                        Group Total
                      </td>
                      {groupClosing.map((val, i) => (
                        <td key={i} className={`px-2 py-2 text-right font-mono font-bold whitespace-nowrap ${cellBg(val)}`}>
                          {val < 0 ? `(${formatCents(Math.abs(val), true)})` : formatCents(val, true)}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span>Closing balance by week.</span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-green-100 dark:bg-green-950/40 inline-block" />
              Positive
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-amber-50 dark:bg-amber-950/30 inline-block" />
              {'Low (<$10k)'}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-red-100 dark:bg-red-950/40 inline-block" />
              Negative
            </span>
          </div>
        </>
      )}
    </div>
  )
}
