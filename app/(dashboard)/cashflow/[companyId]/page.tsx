'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Settings, Clock, Plus, Pencil, Trash2, AlertTriangle,
  CheckCircle2, Loader2, ChevronLeft, CameraIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatWeekHeader } from '@/lib/cashflow'
import ItemModal from '@/components/cashflow/ItemModal'
import type { CashflowItem, CashflowSection, CashflowSettings, ForecastGrid } from '@/lib/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  const abs  = Math.abs(cents)
  const sign = cents < 0 ? '-' : ''
  if (abs >= 1_000_00) {
    return `${sign}$${(abs / 100 / 1000).toFixed(0)}k`
  }
  return `${sign}$${(abs / 100).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const SECTION_LABELS: Record<CashflowSection, string> = {
  inflow:          'INFLOWS',
  regular_outflow: 'REGULAR OUTFLOWS',
  payable:         'PAYABLES',
}

// ─── Component ────────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved'

export default function CashflowPage() {
  const params   = useParams()
  const router   = useRouter()
  const companyId = params?.companyId as string

  const [grid,     setGrid]     = useState<ForecastGrid | null>(null)
  const [items,    setItems]    = useState<CashflowItem[]>([])
  const [settings, setSettings] = useState<CashflowSettings | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  // Modal state
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editingItem,   setEditingItem]   = useState<CashflowItem | null>(null)
  const [defaultSection, setDefaultSection] = useState<CashflowSection>('inflow')

  // Snapshot modal
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false)
  const [snapshotName,      setSnapshotName]      = useState('')
  const [snapshotSaving,    setSnapshotSaving]    = useState(false)

  // Auto-save timer
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchForecast = useCallback(async () => {
    if (!companyId) return
    try {
      const [forecastRes, itemsRes] = await Promise.all([
        fetch(`/api/cashflow/${companyId}/forecast`),
        fetch(`/api/cashflow/${companyId}/items`),
      ])
      const [forecastJson, itemsJson] = await Promise.all([forecastRes.json(), itemsRes.json()])
      if (!forecastRes.ok) throw new Error(forecastJson.error ?? 'Failed to load forecast')
      setGrid(forecastJson.data.grid)
      setSettings(forecastJson.data.settings)
      setItems(itemsJson.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    }
  }, [companyId])

  useEffect(() => {
    setLoading(true)
    fetchForecast().finally(() => setLoading(false))
  }, [fetchForecast])

  // ── Auto-save grid ────────────────────────────────────────────────────────

  const scheduleAutoSave = useCallback((currentGrid: ForecastGrid) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/cashflow/${companyId}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ grid_data: currentGrid }),
        })
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('idle')
      }
    }, 2000)
  }, [companyId])

  // ── Item actions ──────────────────────────────────────────────────────────

  function openCreate(section: CashflowSection) {
    setEditingItem(null)
    setDefaultSection(section)
    setModalOpen(true)
  }

  function openEdit(item: CashflowItem) {
    setEditingItem(item)
    setModalOpen(true)
  }

  async function handleDelete(item: CashflowItem) {
    if (!confirm(`Delete "${item.label}"?`)) return
    await fetch(`/api/cashflow/${companyId}/items/${item.id}`, { method: 'DELETE' })
    await fetchForecast()
    if (grid) scheduleAutoSave(grid)
  }

  async function handleItemSaved(savedItem: CashflowItem) {
    setModalOpen(false)
    setEditingItem(null)
    await fetchForecast()
    // Auto-save after item change
    if (grid) scheduleAutoSave(grid)
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  async function handleSaveSnapshot() {
    if (!snapshotName.trim() || !grid) return
    setSnapshotSaving(true)
    try {
      await fetch(`/api/cashflow/${companyId}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: snapshotName.trim(), grid_data: grid }),
      })
      setSnapshotModalOpen(false)
      setSnapshotName('')
      router.push(`/cashflow/${companyId}/history`)
    } catch {
      // ignore
    } finally {
      setSnapshotSaving(false)
    }
  }

  // ── Pending review ────────────────────────────────────────────────────────

  const pendingItems = items.filter(i => i.pending_review && i.is_active)

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 pt-16 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Link href="/cashflow" className="text-sm underline text-foreground">← Back to companies</Link>
      </div>
    )
  }

  const weeks = grid?.weeks ?? []

  // Row renderer helper
  function renderAmountCell(cents: number, weekIdx: number, isBalance?: boolean) {
    const isNegative = cents < 0
    return (
      <td
        key={weekIdx}
        className={cn(
          'px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap',
          isNegative && isBalance && 'text-red-600 dark:text-red-400 font-semibold',
          isNegative && !isBalance && 'text-red-600 dark:text-red-400',
        )}
      >
        {formatCents(cents)}
      </td>
    )
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href="/cashflow" className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">13-Week Cash Flow</h1>
            <p className="text-xs text-muted-foreground">Manual mode · Auto-computed from items</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Save status */}
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3 w-3" /> Saved
            </span>
          )}

          {/* Snapshot */}
          <button
            onClick={() => setSnapshotModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            <CameraIcon className="h-4 w-4" />
            Save snapshot
          </button>

          <Link
            href={`/cashflow/${companyId}/history`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            <Clock className="h-4 w-4" />
            History
          </Link>

          <Link
            href={`/cashflow/${companyId}/settings`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </div>

      {/* Pending review banner */}
      {pendingItems.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {pendingItems.length} item{pendingItems.length !== 1 ? 's' : ''} pending review
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {pendingItems.map(i => i.label).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Forecast Grid */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            {/* Header row */}
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
              {/* ── INFLOWS ── */}
              <SectionHeader label="INFLOWS" colCount={weeks.length} />
              {grid?.sections.inflows.rows.map(row => (
                <ItemRow
                  key={row.item_id ?? row.label}
                  label={row.label}
                  amounts={row.amounts_cents}
                  pending={row.pending_review}
                  onEdit={() => row.item_id && openEdit(items.find(i => i.id === row.item_id)!)}
                  onDelete={() => row.item_id && handleDelete(items.find(i => i.id === row.item_id)!)}
                  renderAmount={renderAmountCell}
                />
              ))}
              <AddRowButton label="+ Add inflow" onClick={() => openCreate('inflow')} colCount={weeks.length} />
              <SubtotalRow label="INFLOW SUBTOTAL" amounts={grid?.sections.inflows.subtotals ?? []} renderAmount={renderAmountCell} />

              {/* ── REGULAR OUTFLOWS ── */}
              <SeparatorRow colCount={weeks.length + 1} />
              <SectionHeader label="REGULAR OUTFLOWS" colCount={weeks.length} />
              {grid?.sections.regularOutflows.rows.map(row => (
                <ItemRow
                  key={row.item_id ?? row.label}
                  label={row.label}
                  amounts={row.amounts_cents}
                  pending={row.pending_review}
                  onEdit={() => row.item_id && openEdit(items.find(i => i.id === row.item_id)!)}
                  onDelete={() => row.item_id && handleDelete(items.find(i => i.id === row.item_id)!)}
                  renderAmount={renderAmountCell}
                />
              ))}
              <AddRowButton label="+ Add outflow" onClick={() => openCreate('regular_outflow')} colCount={weeks.length} />
              <SubtotalRow label="OUTFLOW SUBTOTAL" amounts={grid?.sections.regularOutflows.subtotals ?? []} renderAmount={renderAmountCell} />

              {/* ── PAYABLES ── */}
              <SeparatorRow colCount={weeks.length + 1} />
              <SectionHeader label="PAYABLES" colCount={weeks.length} />
              {grid?.sections.payables.rows.map(row => (
                <ItemRow
                  key={row.item_id ?? row.label}
                  label={row.label}
                  amounts={row.amounts_cents}
                  pending={row.pending_review}
                  onEdit={() => row.item_id && openEdit(items.find(i => i.id === row.item_id)!)}
                  onDelete={() => row.item_id && handleDelete(items.find(i => i.id === row.item_id)!)}
                  renderAmount={renderAmountCell}
                />
              ))}
              <AddRowButton label="+ Add payable" onClick={() => openCreate('payable')} colCount={weeks.length} />
              <SubtotalRow label="PAYABLES SUBTOTAL" amounts={grid?.sections.payables.subtotals ?? []} renderAmount={renderAmountCell} />

              {/* ── SUMMARY ── */}
              <SeparatorRow colCount={weeks.length + 1} thick />
              <SummaryRow
                label="NET CASH FLOW"
                amounts={grid?.summary.netCashFlow ?? []}
                renderAmount={renderAmountCell}
                bold
              />
              <SummaryRow
                label="OPENING BALANCE"
                amounts={grid?.summary.openingBalance ?? []}
                renderAmount={renderAmountCell}
              />
              <ClosingBalanceRow
                amounts={grid?.summary.closingBalance ?? []}
                renderAmount={renderAmountCell}
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* Item Modal */}
      {modalOpen && (
        <ItemModal
          companyId={companyId}
          item={editingItem}
          defaultSection={defaultSection}
          onSave={handleItemSaved}
          onClose={() => { setModalOpen(false); setEditingItem(null) }}
        />
      )}

      {/* Snapshot name modal */}
      {snapshotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Save Snapshot</h2>
            <input
              type="text"
              value={snapshotName}
              onChange={e => setSnapshotName(e.target.value)}
              placeholder="e.g. Week 14 March 2026"
              className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSnapshotModalOpen(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSnapshot}
                disabled={!snapshotName.trim() || snapshotSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--palette-primary)' }}
              >
                {snapshotSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, colCount }: { label: string; colCount: number }) {
  return (
    <tr className="bg-muted/20">
      <td className="sticky left-0 z-10 bg-muted/20 px-4 py-1.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
        {label}
      </td>
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} />
      ))}
    </tr>
  )
}

function SeparatorRow({ colCount, thick = false }: { colCount: number; thick?: boolean }) {
  return (
    <tr>
      <td
        colSpan={colCount}
        className={cn('p-0', thick ? 'border-t-2 border-border' : 'border-t border-border/50')}
      />
    </tr>
  )
}

function AddRowButton({ label, onClick, colCount }: { label: string; onClick: () => void; colCount: number }) {
  return (
    <tr>
      <td className="sticky left-0 z-10 bg-background px-4 py-1">
        <button
          onClick={onClick}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3 w-3" />
          {label}
        </button>
      </td>
      {Array.from({ length: colCount }).map((_, i) => <td key={i} />)}
    </tr>
  )
}

function SubtotalRow({
  label, amounts, renderAmount,
}: {
  label: string
  amounts: number[]
  renderAmount: (c: number, i: number) => React.ReactNode
}) {
  return (
    <tr className="bg-muted/20 font-semibold border-t border-border/50">
      <td className="sticky left-0 z-10 bg-muted/20 px-4 py-2 text-xs text-foreground font-semibold">
        {label}
      </td>
      {amounts.map((c, i) => renderAmount(c, i))}
    </tr>
  )
}

function SummaryRow({
  label, amounts, renderAmount, bold = false,
}: {
  label: string
  amounts: number[]
  renderAmount: (c: number, i: number) => React.ReactNode
  bold?: boolean
}) {
  return (
    <tr className={cn(bold && 'font-bold')}>
      <td className={cn('sticky left-0 z-10 bg-background px-4 py-2 text-xs text-foreground', bold && 'font-bold')}>
        {label}
      </td>
      {amounts.map((c, i) => renderAmount(c, i))}
    </tr>
  )
}

function ClosingBalanceRow({
  amounts, 
}: {
  amounts: number[]
  renderAmount: (c: number, i: number, isBalance?: boolean) => React.ReactNode
}) {
  return (
    <tr className="font-bold border-t border-border">
      <td className="sticky left-0 z-10 bg-background px-4 py-2 text-xs text-foreground font-bold">
        CLOSING BALANCE
      </td>
      {amounts.map((c, i) => (
        <td
          key={i}
          className={cn(
            'px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap font-bold',
            c < 0
              ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20'
              : 'text-foreground'
          )}
        >
          {c < 0 ? `($${Math.abs(c / 100).toLocaleString('en-AU', { minimumFractionDigits: 0 })})` : formatCents(c)}
        </td>
      ))}
    </tr>
  )
}

function ItemRow({
  label, amounts, pending, onEdit, onDelete, renderAmount,
}: {
  label:        string
  amounts:      number[]
  pending:      boolean
  onEdit:       () => void
  onDelete:     () => void
  renderAmount: (c: number, i: number) => React.ReactNode
}) {
  return (
    <tr className="group hover:bg-muted/10 transition-colors border-t border-border/30">
      <td className="sticky left-0 z-10 bg-background group-hover:bg-muted/10 px-4 py-1.5">
        <div className="flex items-center gap-2">
          {pending && (
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Pending review" />
          )}
          <span className="text-xs text-foreground truncate max-w-[140px]" title={label}>{label}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
            <button onClick={onEdit}   className="p-0.5 text-muted-foreground hover:text-foreground"><Pencil   className="h-3 w-3" /></button>
            <button onClick={onDelete} className="p-0.5 text-muted-foreground hover:text-destructive"><Trash2  className="h-3 w-3" /></button>
          </div>
        </div>
      </td>
      {amounts.map((c, i) => renderAmount(c, i))}
    </tr>
  )
}
