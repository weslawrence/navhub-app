'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatWeekHeader } from '@/lib/cashflow'
import type { CashflowSnapshot, ForecastGrid } from '@/lib/types'

function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  const abs  = Math.abs(cents)
  const sign = cents < 0 ? '-' : ''
  if (abs >= 1_000_00) {
    return `${sign}$${(abs / 100 / 1000).toFixed(0)}k`
  }
  return `${sign}$${(abs / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function SnapshotViewerPage() {
  const params     = useParams()
  const companyId  = params?.companyId  as string
  const snapshotId = params?.snapshotId as string

  const [snapshot,  setSnapshot]  = useState<CashflowSnapshot | null>(null)
  const [groupName, setGroupName] = useState<string>('')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [snapRes, groupRes] = await Promise.all([
        fetch(`/api/cashflow/${companyId}/snapshots/${snapshotId}`),
        fetch('/api/groups/active'),
      ])
      const snapJson  = await snapRes.json()
      const groupJson = await groupRes.json()
      if (!snapRes.ok) throw new Error(snapJson.error ?? 'Not found')
      setSnapshot(snapJson.data)
      if (groupJson.data?.group?.name) setGroupName(groupJson.data.group.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [companyId, snapshotId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !snapshot) {
    return (
      <div className="space-y-4">
        <Link href={`/cashflow/${companyId}/history`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to history
        </Link>
        <p className="text-sm text-destructive">{error ?? 'Snapshot not found'}</p>
      </div>
    )
  }

  const grid = snapshot.grid_data as ForecastGrid
  const weeks = grid?.weeks ?? []

  function renderCell(cents: number, idx: number, isClosing?: boolean) {
    const neg = cents < 0
    return (
      <td
        key={idx}
        className={cn(
          'px-3 py-1.5 text-right text-xs tabular-nums whitespace-nowrap',
          neg && isClosing && 'text-red-600 dark:text-red-400 font-semibold bg-red-50 dark:bg-red-950/20',
          neg && !isClosing && 'text-red-600 dark:text-red-400',
        )}
      >
        {isClosing && neg
          ? `($${Math.abs(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 0 })})`
          : formatCents(cents)}
      </td>
    )
  }

  return (
    <div className="space-y-4">
      {/* Branded header */}
      <div
        className="flex items-center gap-3 px-4 -mx-4 -mt-4 mb-0 flex-shrink-0"
        style={{
          height:       '44px',
          background:   'var(--palette-surface, #1a1d27)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <span className="text-sm font-semibold tracking-tight leading-none select-none">
          <span style={{ color: 'var(--palette-primary, #0ea5e9)' }}>nav</span>
          <span className="text-white/50">hub</span>
        </span>
        <div className="h-4 w-px bg-white/15" />
        {groupName && (
          <span className="text-xs text-white/60 truncate max-w-[140px]">{groupName}</span>
        )}
        <div className="h-4 w-px bg-white/15" />
        <span className="text-xs text-white/50">Cash Flow Snapshot</span>
        <div className="h-4 w-px bg-white/15" />
        <span className="text-xs text-white/40 truncate flex-1">{snapshot.name}</span>
        <Link
          href={`/cashflow/${companyId}/history`}
          className="ml-auto text-xs text-white/40 hover:text-white/70 transition-colors flex-shrink-0"
        >
          Back to History
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/cashflow/${companyId}/history`} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">{snapshot.name}</h1>
          <p className="text-xs text-muted-foreground">
            Snapshot saved {formatDate(snapshot.created_at)}
            {snapshot.notes && ` · ${snapshot.notes}`}
          </p>
        </div>
      </div>

      {/* Read-only grid */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2 text-left text-xs font-semibold text-muted-foreground min-w-[200px] w-[200px]">
                  Account
                </th>
                {weeks.map(w => (
                  <th key={w} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap min-w-[90px]">
                    {formatWeekHeader(w)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* INFLOWS */}
              <tr className="bg-muted/20">
                <td className="sticky left-0 z-10 bg-muted/20 px-4 py-1.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground">INFLOWS</td>
                {Array.from({ length: weeks.length }).map((_, i) => <td key={i} />)}
              </tr>
              {grid?.sections.inflows.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-border/30">
                  <td className="sticky left-0 z-10 bg-background px-4 py-1.5 text-xs text-foreground">{row.label}</td>
                  {row.amounts_cents.map((c, i) => renderCell(c, i))}
                </tr>
              ))}
              <tr className="bg-muted/20 font-semibold border-t border-border/50">
                <td className="sticky left-0 z-10 bg-muted/20 px-4 py-2 text-xs text-foreground font-semibold">INFLOW SUBTOTAL</td>
                {(grid?.sections.inflows.subtotals ?? []).map((c, i) => renderCell(c, i))}
              </tr>

              {/* REGULAR OUTFLOWS */}
              <tr><td colSpan={weeks.length + 1} className="p-0 border-t border-border/50" /></tr>
              <tr className="bg-muted/20">
                <td className="sticky left-0 z-10 bg-muted/20 px-4 py-1.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground">REGULAR OUTFLOWS</td>
                {Array.from({ length: weeks.length }).map((_, i) => <td key={i} />)}
              </tr>
              {grid?.sections.regularOutflows.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-border/30">
                  <td className="sticky left-0 z-10 bg-background px-4 py-1.5 text-xs text-foreground">{row.label}</td>
                  {row.amounts_cents.map((c, i) => renderCell(c, i))}
                </tr>
              ))}
              <tr className="bg-muted/20 font-semibold border-t border-border/50">
                <td className="sticky left-0 z-10 bg-muted/20 px-4 py-2 text-xs text-foreground font-semibold">OUTFLOW SUBTOTAL</td>
                {(grid?.sections.regularOutflows.subtotals ?? []).map((c, i) => renderCell(c, i))}
              </tr>

              {/* PAYABLES */}
              <tr><td colSpan={weeks.length + 1} className="p-0 border-t border-border/50" /></tr>
              <tr className="bg-muted/20">
                <td className="sticky left-0 z-10 bg-muted/20 px-4 py-1.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground">PAYABLES</td>
                {Array.from({ length: weeks.length }).map((_, i) => <td key={i} />)}
              </tr>
              {grid?.sections.payables.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-border/30">
                  <td className="sticky left-0 z-10 bg-background px-4 py-1.5 text-xs text-foreground">{row.label}</td>
                  {row.amounts_cents.map((c, i) => renderCell(c, i))}
                </tr>
              ))}
              <tr className="bg-muted/20 font-semibold border-t border-border/50">
                <td className="sticky left-0 z-10 bg-muted/20 px-4 py-2 text-xs text-foreground font-semibold">PAYABLES SUBTOTAL</td>
                {(grid?.sections.payables.subtotals ?? []).map((c, i) => renderCell(c, i))}
              </tr>

              {/* SUMMARY */}
              <tr><td colSpan={weeks.length + 1} className="p-0 border-t-2 border-border" /></tr>
              <tr className="font-bold">
                <td className="sticky left-0 z-10 bg-background px-4 py-2 text-xs text-foreground font-bold">NET CASH FLOW</td>
                {(grid?.summary.netCashFlow ?? []).map((c, i) => renderCell(c, i))}
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-background px-4 py-2 text-xs text-foreground">OPENING BALANCE</td>
                {(grid?.summary.openingBalance ?? []).map((c, i) => renderCell(c, i))}
              </tr>
              <tr className="font-bold border-t border-border">
                <td className="sticky left-0 z-10 bg-background px-4 py-2 text-xs text-foreground font-bold">CLOSING BALANCE</td>
                {(grid?.summary.closingBalance ?? []).map((c, i) => renderCell(c, i, true))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
