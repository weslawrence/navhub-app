'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronRight, RefreshCw, Share2, RotateCcw, Check, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge }  from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import type { ForecastStream, ForecastUserState, NumberFormat } from '@/lib/types'

// ─── Math helpers ─────────────────────────────────────────────────────────────

/** Revenue for a stream in a given year (1-indexed). Y1 = baseline. */
function streamRevenue(baseline: number, gr: number, year: number): number {
  if (baseline <= 0) return 0
  return Math.round(baseline * Math.pow(1 + gr / 100, year - 1))
}

function streamGP(revenue: number, gp: number): number {
  return Math.round(revenue * gp / 100)
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 100)
}

function formatPct(n: number, showSign = false): string {
  const s = showSign && n > 0 ? '+' : ''
  return `${s}${n}%`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RevenueModelPage() {
  const [streams,  setStreams]  = useState<ForecastStream[]>([])
  const [year,     setYear]     = useState(1)
  const [showGP,   setShowGP]   = useState(false)
  const [showAll,  setShowAll]  = useState(true)
  const [rates,    setRates]    = useState<Record<string, { gr: number; gp: number }>>({})
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState<string | null>(null)
  const [copyMsg,  setCopyMsg]  = useState<string | null>(null)
  const [prefs,    setPrefs]    = useState({ number_format: 'thousands' as NumberFormat, currency: 'AUD' })

  const saveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveMsgTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyMsgTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initDone      = useRef(false)

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch('/api/forecast/streams').then(r => r.json()),
      fetch('/api/forecast/state').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]).then(([streamsJson, stateJson, prefsJson]) => {
      const loadedStreams: ForecastStream[] = streamsJson.data ?? []
      setStreams(loadedStreams)

      if (prefsJson.data) setPrefs(prefsJson.data)

      // Build rate map from saved state or stream defaults
      const saved: ForecastUserState = stateJson.data ?? { year: 1, showGP: false, showAll: true, rates: {} }
      const initRates: Record<string, { gr: number; gp: number }> = {}
      loadedStreams.forEach(s => {
        initRates[s.id] = {
          gr: saved.rates?.[s.id]?.gr ?? s.default_growth_rate,
          gp: saved.rates?.[s.id]?.gp ?? s.default_gp_margin,
        }
      })

      let resolvedYear  = saved.year  ?? 1
      const resolvedShowGP  = saved.showGP  ?? false
      const resolvedShowAll = saved.showAll ?? true

      // URL params take priority over saved state
      const params = new URLSearchParams(window.location.search)
      const yrParam = params.get('yr')
      if (yrParam) resolvedYear = Math.min(7, Math.max(1, parseInt(yrParam) || 1))
      loadedStreams.forEach(s => {
        const grParam = params.get(`${s.id}_gr`)
        const gpParam = params.get(`${s.id}_gp`)
        if (grParam !== null) initRates[s.id].gr = Math.min(120, Math.max(0, parseInt(grParam) || 0))
        if (gpParam !== null) initRates[s.id].gp = Math.min(100, Math.max(0, parseInt(gpParam) || 0))
      })

      setYear(resolvedYear)
      setShowGP(resolvedShowGP)
      setShowAll(resolvedShowAll)
      setRates(initRates)
      initDone.current = true
    }).finally(() => setLoading(false))
  }, [])

  // ── Auto-save ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!initDone.current || loading) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      fetch('/api/forecast/state', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ year, showGP, showAll, rates }),
      })
    }, 2000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [year, showGP, showAll, rates, loading])

  // ── Helpers ───────────────────────────────────────────────────────────────

  const fmt = (v: number | null) =>
    formatCurrency(v, prefs.number_format, prefs.currency)

  function getRate(streamId: string) {
    return rates[streamId] ?? { gr: 20, gp: 40 }
  }

  function calcStreamRevenue(s: ForecastStream, yr: number): number {
    return streamRevenue(s.y1_baseline, getRate(s.id).gr, yr)
  }

  function calcStreamGP(s: ForecastStream, yr: number): number {
    return streamGP(calcStreamRevenue(s, yr), getRate(s.id).gp)
  }

  function calcTotal(yr: number): number {
    return streams.reduce((sum, s) => sum + calcStreamRevenue(s, yr), 0)
  }

  function calcTotalGP(yr: number): number {
    return streams.reduce((sum, s) => sum + calcStreamGP(s, yr), 0)
  }

  function updateRate(id: string, field: 'gr' | 'gp', value: number) {
    setRates(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function handleReset() {
    const reset: Record<string, { gr: number; gp: number }> = {}
    streams.forEach(s => { reset[s.id] = { gr: s.default_growth_rate, gp: s.default_gp_margin } })
    setRates(reset)
    setYear(1)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/forecast/state', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ year, showGP, showAll, rates }),
      })
      setSaveMsg('Saved ✓')
      if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current)
      saveMsgTimer.current = setTimeout(() => setSaveMsg(null), 2500)
    } finally {
      setSaving(false)
    }
  }

  function handleCopyLink() {
    const params = new URLSearchParams()
    params.set('yr', String(year))
    streams.forEach(s => {
      params.set(`${s.id}_gr`, String(getRate(s.id).gr))
      params.set(`${s.id}_gp`, String(getRate(s.id).gp))
    })
    const url = `${window.location.origin}/forecasting/revenue?${params.toString()}`
    navigator.clipboard.writeText(url).then(() => {
      setCopyMsg('Link copied!')
      if (copyMsgTimer.current) clearTimeout(copyMsgTimer.current)
      copyMsgTimer.current = setTimeout(() => setCopyMsg(null), 2500)
    })
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const totalRevenue    = calcTotal(year)
  const totalGP         = calcTotalGP(year)
  const gpMarginPct     = pct(totalGP, totalRevenue)
  const totalY1Revenue  = calcTotal(1)
  const vsY1            = totalY1Revenue > 0 ? (totalRevenue / totalY1Revenue) : 1
  const prevYearRevenue = year > 1 ? calcTotal(year - 1) : totalRevenue
  const yoyGrowthPct    = year > 1 && prevYearRevenue > 0
    ? Math.round((totalRevenue / prevYearRevenue - 1) * 100)
    : 0

  const sortedByRevenue = [...streams].sort((a, b) => calcStreamRevenue(b, year) - calcStreamRevenue(a, year))
  const largestStream   = sortedByRevenue[0]

  const maxBarRevenue = Math.max(
    ...([1, 2, 3, 4, 5, 6, 7].map(yr => calcTotal(yr))),
    1
  )

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-4 bg-muted rounded w-72" />
        <div className="h-96 bg-muted rounded" />
      </div>
    )
  }

  if (streams.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Revenue Model</h1>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground rounded-lg border border-dashed">
          <p className="text-sm font-medium mb-1">No revenue streams configured</p>
          <p className="text-xs text-center max-w-xs mb-4">
            Set up your revenue streams to start building the forecast.
          </p>
          <Button size="sm" asChild>
            <Link href="/forecasting/setup">Configure streams</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div>
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">Revenue Model</span>
        </nav>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Revenue Model</h1>
          <Link href="/forecasting/setup" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Settings2 className="h-3.5 w-3.5" /> Manage streams
          </Link>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ─── Left panel: Controls ─── */}
        <div className="lg:w-72 shrink-0 space-y-5">

          {/* Year selector */}
          <section className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Forecast Year</p>
              <Badge variant="secondary" className="tabular-nums">Y{year}</Badge>
            </div>
            <input
              type="range"
              min="1"
              max="7"
              step="1"
              value={year}
              onChange={e => setYear(parseInt(e.target.value))}
              className="w-full accent-primary"
              style={{ accentColor: 'var(--palette-primary)' }}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              {[1, 2, 3, 4, 5, 6, 7].map(y => (
                <button key={y} onClick={() => setYear(y)} className={cn('hover:text-foreground', y === year && 'text-foreground font-semibold')}>
                  Y{y}
                </button>
              ))}
            </div>
            <p className="text-sm font-semibold text-center pt-1" style={{ color: 'var(--palette-primary)' }}>
              {fmt(totalRevenue)}
            </p>
          </section>

          {/* Growth rate sliders */}
          <section className="rounded-lg border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Annual Growth Rate</p>
            {streams.map(s => {
              const gr = getRate(s.id).gr
              return (
                <div key={s.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="truncate">{s.name}</span>
                    </div>
                    <span className="font-medium tabular-nums shrink-0 ml-2">{gr}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="120"
                    step="5"
                    value={gr}
                    onChange={e => updateRate(s.id, 'gr', parseInt(e.target.value))}
                    className="w-full"
                    style={{ accentColor: s.color }}
                  />
                </div>
              )
            })}
          </section>

          {/* GP margin sliders */}
          <section className="rounded-lg border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">GP Margin</p>
            {streams.map(s => {
              const gp = getRate(s.id).gp
              return (
                <div key={s.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="truncate">{s.name}</span>
                    </div>
                    <span className="font-medium tabular-nums shrink-0 ml-2">{gp}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="85"
                    step="1"
                    value={gp}
                    onChange={e => updateRate(s.id, 'gp', parseInt(e.target.value))}
                    className="w-full"
                    style={{ accentColor: s.color }}
                  />
                </div>
              )
            })}
          </section>

          {/* Display toggles */}
          <section className="rounded-lg border p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Display</p>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={showGP}
                onChange={e => setShowGP(e.target.checked)}
                className="rounded accent-primary"
                style={{ accentColor: 'var(--palette-primary)' }}
              />
              Show GP in table &amp; cards
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={showAll}
                onChange={e => setShowAll(e.target.checked)}
                className="rounded accent-primary"
                style={{ accentColor: 'var(--palette-primary)' }}
              />
              Show all years in chart
            </label>
          </section>

          {/* Actions */}
          <section className="space-y-2">
            <Button size="sm" variant="outline" onClick={handleReset} className="w-full justify-start gap-2">
              <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
            </Button>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleSave} disabled={saving} className="flex-1 justify-center gap-2">
                {saving
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                  : <><Check className="h-3.5 w-3.5" /> Save view</>}
              </Button>
              {saveMsg && <span className="text-xs text-green-600 dark:text-green-400">{saveMsg}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleCopyLink} className="flex-1 justify-center gap-2">
                <Share2 className="h-3.5 w-3.5" /> Copy share link
              </Button>
              {copyMsg && <span className="text-xs text-muted-foreground">{copyMsg}</span>}
            </div>
          </section>
        </div>

        {/* ─── Right panel: Output ─── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Total card */}
          <div
            className="rounded-lg border p-5"
            style={{ borderLeft: '4px solid var(--palette-primary)' }}
          >
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Group Revenue · Y{year}</p>
                <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--palette-primary)' }}>
                  {fmt(totalRevenue)}
                </p>
              </div>
              {showGP && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Gross Profit</p>
                  <p className="text-2xl font-bold tabular-nums">{fmt(totalGP)}</p>
                  <p className="text-xs text-muted-foreground">{gpMarginPct}% GP margin</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">vs Y1</p>
                <p className="text-2xl font-bold tabular-nums">{vsY1.toFixed(1)}×</p>
              </div>
              {year > 1 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">YoY growth</p>
                  <p className={cn('text-2xl font-bold tabular-nums', yoyGrowthPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                    {formatPct(yoyGrowthPct, true)}
                  </p>
                </div>
              )}
              {largestStream && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Largest stream</p>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: largestStream.color }} />
                    <p className="text-sm font-semibold">{largestStream.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pct(calcStreamRevenue(largestStream, year), totalRevenue)}% of total
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Revenue mix bar */}
          {totalRevenue > 0 && (
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Revenue Mix · Y{year}</p>
              <div className="flex rounded-md overflow-hidden h-7">
                {streams.map(s => {
                  const rev = calcStreamRevenue(s, year)
                  const share = pct(rev, totalRevenue)
                  if (share === 0) return null
                  return (
                    <div
                      key={s.id}
                      style={{ width: `${share}%`, backgroundColor: s.color }}
                      title={`${s.name}: ${fmt(rev)} (${share}%)`}
                      className="transition-all duration-300"
                    />
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-3">
                {streams.map(s => {
                  const rev = calcStreamRevenue(s, year)
                  const share = pct(rev, totalRevenue)
                  return (
                    <div key={s.id} className="flex items-center gap-1.5 text-xs">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-muted-foreground">{s.name}</span>
                      <span className="font-medium">{share}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bar chart */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {showAll ? 'Revenue by Year (Y1–Y7)' : `Revenue by Stream · Y${year}`}
            </p>

            {showAll ? (
              /* Stacked bars — all 7 years */
              <div className="space-y-2">
                <div className="flex items-end gap-1.5 h-40 px-1">
                  {[1, 2, 3, 4, 5, 6, 7].map(yr => {
                    const total = calcTotal(yr)
                    const heightPct = maxBarRevenue > 0 ? (total / maxBarRevenue) * 100 : 0
                    const isSelected = yr === year
                    return (
                      <button
                        key={yr}
                        onClick={() => setYear(yr)}
                        className="flex-1 flex flex-col overflow-hidden rounded-t-sm transition-opacity"
                        style={{ height: `${Math.max(heightPct, 2)}%`, opacity: isSelected ? 1 : 0.55 }}
                        title={`Y${yr}: ${fmt(total)}`}
                      >
                        {streams.map(s => {
                          const rev = calcStreamRevenue(s, yr)
                          const segPct = total > 0 ? (rev / total) * 100 : 0
                          return (
                            <div
                              key={s.id}
                              style={{ height: `${segPct}%`, backgroundColor: s.color, minHeight: rev > 0 ? '2px' : '0' }}
                            />
                          )
                        })}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-1.5 px-1">
                  {[1, 2, 3, 4, 5, 6, 7].map(yr => (
                    <div key={yr} className={cn('flex-1 text-center text-[10px]', yr === year ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                      Y{yr}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Single-year bars — one per stream */
              (() => {
                const maxStreamRev = Math.max(...streams.map(s => calcStreamRevenue(s, year)), 1)
                return (
                  <div className="space-y-2">
                    <div className="flex items-end gap-2 h-40 px-1">
                      {sortedByRevenue.map(s => {
                        const rev = calcStreamRevenue(s, year)
                        const heightPct = (rev / maxStreamRev) * 100
                        return (
                          <div key={s.id} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                            <span className="text-[10px] text-muted-foreground text-center leading-tight">
                              {fmt(rev)}
                            </span>
                            <div
                              className="w-full rounded-t-sm"
                              style={{ height: `${Math.max(heightPct, 2)}%`, backgroundColor: s.color }}
                            />
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex gap-2 px-1">
                      {sortedByRevenue.map(s => (
                        <div key={s.id} className="flex-1 text-center text-[10px] text-muted-foreground truncate">{s.name}</div>
                      ))}
                    </div>
                  </div>
                )
              })()
            )}
          </div>

          {/* Stream cards (2-column grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sortedByRevenue.map(s => {
              const rev      = calcStreamRevenue(s, year)
              const gp       = calcStreamGP(s, year)
              const revY1    = calcStreamRevenue(s, 1)
              const revPrev  = year > 1 ? calcStreamRevenue(s, year - 1) : rev
              const yoy      = year > 1 && revPrev > 0 ? Math.round((rev / revPrev - 1) * 100) : 0
              const vsY1Val  = revY1 > 0 ? (rev / revY1) : 1
              const share    = pct(rev, totalRevenue)
              return (
                <div
                  key={s.id}
                  className="rounded-lg border p-4 space-y-2"
                  style={{ borderLeft: `3px solid ${s.color}` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-sm font-semibold truncate">{s.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{s.tag}</Badge>
                  </div>
                  <p className="text-xl font-bold tabular-nums">{fmt(rev)}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Y1 baseline</span>
                    <span className="font-medium text-foreground text-right">{fmt(s.y1_baseline)}</span>
                    {showGP && (
                      <>
                        <span>Gross profit</span>
                        <span className="font-medium text-foreground text-right">{fmt(gp)}</span>
                      </>
                    )}
                    {year > 1 && (
                      <>
                        <span>YoY growth</span>
                        <span className={cn('font-medium text-right', yoy >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                          {formatPct(yoy, true)}
                        </span>
                      </>
                    )}
                    <span>vs Y1</span>
                    <span className="font-medium text-foreground text-right">{vsY1Val.toFixed(1)}×</span>
                    <span>% of total</span>
                    <span className="font-medium text-foreground text-right">{share}%</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary table */}
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground sticky left-0 bg-muted/50 min-w-[140px]">
                      Stream
                    </th>
                    {[1, 2, 3, 4, 5, 6, 7].map(yr => (
                      <th
                        key={yr}
                        className={cn(
                          'text-right px-3 py-2.5 text-xs font-semibold whitespace-nowrap min-w-[90px]',
                          yr === year ? 'text-foreground' : 'text-muted-foreground'
                        )}
                        style={yr === year ? { color: 'var(--palette-primary)' } : undefined}
                      >
                        Y{yr}
                      </th>
                    ))}
                    {showGP && (
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap min-w-[90px] bg-muted/30">
                        GP (Y{year})
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {streams.map(s => (
                    <tr key={s.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2 sticky left-0 bg-background">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="text-xs truncate">{s.name}</span>
                        </div>
                      </td>
                      {[1, 2, 3, 4, 5, 6, 7].map(yr => {
                        const rev = calcStreamRevenue(s, yr)
                        return (
                          <td
                            key={yr}
                            className={cn('px-3 py-2 text-right text-xs tabular-nums')}
                            style={yr === year ? { fontWeight: 600, color: 'var(--palette-primary)' } : undefined}
                          >
                            {fmt(rev)}
                          </td>
                        )
                      })}
                      {showGP && (
                        <td className="px-3 py-2 text-right text-xs tabular-nums bg-muted/10">
                          {fmt(calcStreamGP(s, year))}
                        </td>
                      )}
                    </tr>
                  ))}

                  {/* Total Revenue row */}
                  <tr className="border-b bg-muted/20 font-semibold">
                    <td className="px-4 py-2 text-xs sticky left-0 bg-muted/20">Total Revenue</td>
                    {[1, 2, 3, 4, 5, 6, 7].map(yr => (
                      <td
                        key={yr}
                        className="px-3 py-2 text-right text-xs tabular-nums"
                        style={yr === year ? { color: 'var(--palette-primary)' } : undefined}
                      >
                        {fmt(calcTotal(yr))}
                      </td>
                    ))}
                    {showGP && (
                      <td className="px-3 py-2 text-right text-xs tabular-nums bg-muted/30" />
                    )}
                  </tr>

                  {/* Total GP row — only if showGP */}
                  {showGP && (
                    <tr className="bg-muted/10 font-semibold">
                      <td className="px-4 py-2 text-xs sticky left-0 bg-muted/10">Total GP</td>
                      {[1, 2, 3, 4, 5, 6, 7].map(yr => (
                        <td
                          key={yr}
                          className="px-3 py-2 text-right text-xs tabular-nums"
                          style={yr === year ? { color: 'var(--palette-primary)' } : undefined}
                        >
                          {fmt(calcTotalGP(yr))}
                        </td>
                      ))}
                      {showGP && (
                        <td className="px-3 py-2 text-right text-xs tabular-nums bg-muted/30">
                          {fmt(totalGP)}
                        </td>
                      )}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
