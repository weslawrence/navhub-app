'use client'

import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CashflowItem, CashflowSection, CashflowRecurrence } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ItemModalProps {
  companyId:     string
  item?:         CashflowItem | null       // null/undefined = create mode
  defaultSection?: CashflowSection         // used when creating
  onSave:        (item: CashflowItem) => void
  onClose:       () => void
}

const SECTION_LABELS: Record<CashflowSection, string> = {
  inflow:          'Inflow',
  regular_outflow: 'Regular Outflow',
  payable:         'Payable',
}

const RECURRENCE_LABELS: Record<CashflowRecurrence, string> = {
  weekly:      'Weekly',
  fortnightly: 'Fortnightly',
  monthly:     'Monthly',
  one_off:     'One-off',
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ─── Component ────────────────────────────────────────────────────────────────

export default function ItemModal({ companyId, item, defaultSection, onSave, onClose }: ItemModalProps) {
  const isEdit = !!item

  const [label,       setLabel]       = useState(item?.label       ?? '')
  const [section,     setSection]     = useState<CashflowSection>(item?.section ?? defaultSection ?? 'inflow')
  const [amountDollars, setAmountDollars] = useState(item ? String(Math.abs(item.amount_cents) / 100) : '')
  const [recurrence,  setRecurrence]  = useState<CashflowRecurrence>(item?.recurrence ?? 'monthly')
  const [startDate,   setStartDate]   = useState(item?.start_date ?? new Date().toISOString().split('T')[0])
  const [endDate,     setEndDate]     = useState(item?.end_date    ?? '')
  const [dayOfWeek,   setDayOfWeek]   = useState<number>(item?.day_of_week ?? 1)  // Monday
  const [dayOfMonth,  setDayOfMonth]  = useState<number>(item?.day_of_month ?? 1)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Reset day fields when recurrence changes
  useEffect(() => {
    if (recurrence === 'monthly' && !item?.day_of_month) setDayOfMonth(1)
    if ((recurrence === 'weekly' || recurrence === 'fortnightly') && item?.day_of_week === undefined) setDayOfWeek(1)
  }, [recurrence, item])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amountCents = Math.round(parseFloat(amountDollars) * 100)
    if (isNaN(amountCents) || amountCents < 0) {
      setError('Amount must be a positive number')
      return
    }
    if (!label.trim()) {
      setError('Label is required')
      return
    }

    const body: Record<string, unknown> = {
      label:        label.trim(),
      section,
      amount_cents: amountCents,
      recurrence,
      start_date:   startDate,
      end_date:     endDate || null,
      day_of_week:  (recurrence === 'weekly' || recurrence === 'fortnightly') ? dayOfWeek  : null,
      day_of_month: recurrence === 'monthly' ? dayOfMonth : null,
    }

    setSaving(true)
    try {
      const url    = isEdit
        ? `/api/cashflow/${companyId}/items/${item!.id}`
        : `/api/cashflow/${companyId}/items`
      const method = isEdit ? 'PATCH' : 'POST'

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      onSave(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-foreground">
            {isEdit ? 'Edit Item' : 'Add Cash Flow Item'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Label */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Label</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Customer receipts"
              className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              required
            />
          </div>

          {/* Section */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Section</label>
            <select
              value={section}
              onChange={e => setSection(e.target.value as CashflowSection)}
              className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {Object.entries(SECTION_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Amount ($)</label>
            <input
              type="number"
              value={amountDollars}
              onChange={e => setAmountDollars(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              required
            />
          </div>

          {/* Recurrence */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Recurrence</label>
            <select
              value={recurrence}
              onChange={e => setRecurrence(e.target.value as CashflowRecurrence)}
              className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {Object.entries(RECURRENCE_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </div>

          {/* Day of week (weekly / fortnightly) */}
          {(recurrence === 'weekly' || recurrence === 'fortnightly') && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Day of Week</label>
              <select
                value={dayOfWeek}
                onChange={e => setDayOfWeek(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {DAY_NAMES.map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Day of month (monthly) */}
          {recurrence === 'monthly' && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Day of Month</label>
              <input
                type="number"
                value={dayOfMonth}
                onChange={e => setDayOfMonth(Number(e.target.value))}
                min="1"
                max="31"
                className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          )}

          {/* Start / End dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">End Date <span className="text-muted-foreground">(optional)</span></label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity',
                saving && 'opacity-70'
              )}
              style={{ backgroundColor: 'var(--palette-primary)' }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
