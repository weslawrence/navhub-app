'use client'

import { useState, useEffect } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { cn }     from '@/lib/utils'
import {
  MARKETING_PLATFORM_LABELS,
  MARKETING_PLATFORM_ICONS,
  MARKETING_METRICS,
  type MarketingPlatform,
} from '@/lib/types'

interface MarketingEntryModalProps {
  platform:   MarketingPlatform
  companyId:  string | null
  groupId:    string
  onSave:     () => void
  onClose:    () => void
}

type QuickPreset = 'this_month' | 'last_month' | 'this_quarter'

function getMonthRange(offset: number): { start: string; end: string } {
  const now   = new Date()
  const year  = now.getMonth() - offset < 0
    ? now.getFullYear() - 1
    : now.getFullYear()
  const month = ((now.getMonth() - offset % 12 + 12) % 12)
  const start = new Date(year, month, 1)
  const end   = new Date(year, month + 1, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  }
}

function getQuarterRange(): { start: string; end: string } {
  const now     = new Date()
  const quarter = Math.floor(now.getMonth() / 3)
  const start   = new Date(now.getFullYear(), quarter * 3, 1)
  const end     = new Date(now.getFullYear(), quarter * 3 + 3, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  }
}

export default function MarketingEntryModal({
  platform,
  companyId,
  groupId: _groupId,
  onSave,
  onClose,
}: MarketingEntryModalProps) {
  const metrics = MARKETING_METRICS[platform] ?? []

  const [preset,      setPreset]      = useState<QuickPreset>('last_month')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd,   setPeriodEnd]   = useState('')
  const [values,      setValues]      = useState<Record<string, string>>({})
  const [saving,      setSaving]      = useState(false)
  const [success,     setSuccess]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Apply preset on mount or change
  useEffect(() => {
    let range: { start: string; end: string }
    if (preset === 'this_month')  range = getMonthRange(0)
    else if (preset === 'last_month') range = getMonthRange(1)
    else range = getQuarterRange()
    setPeriodStart(range.start)
    setPeriodEnd(range.end)
  }, [preset])

  function handleValue(key: string, raw: string) {
    setValues(prev => ({ ...prev, [key]: raw }))
  }

  async function handleSave() {
    if (!periodStart || !periodEnd) {
      setError('Please set a date range.')
      return
    }

    // Build metrics object — skip blanks
    const metricsObj: Record<string, number> = {}
    for (const [key, raw] of Object.entries(values)) {
      const n = parseFloat(raw)
      if (!isNaN(n) && raw.trim() !== '') metricsObj[key] = n
    }

    if (Object.keys(metricsObj).length === 0) {
      setError('Enter at least one metric value.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/marketing/snapshots/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          company_id:   companyId,
          platform,
          period_start: periodStart,
          period_end:   periodEnd,
          period_type:  'month',
          metrics:      metricsObj,
        }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      setSuccess(true)
      setTimeout(() => {
        onSave()
        onClose()
      }, 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const PRESETS: { value: QuickPreset; label: string }[] = [
    { value: 'this_month',  label: 'This month'  },
    { value: 'last_month',  label: 'Last month'  },
    { value: 'this_quarter', label: 'This quarter' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">{MARKETING_PLATFORM_ICONS[platform]}</span>
              <h2 className="text-base font-semibold text-foreground">
                Enter {MARKETING_PLATFORM_LABELS[platform]} Data
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Period selector */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Period</Label>
            <div className="mt-2 flex gap-1">
              {PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPreset(p.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                    preset === p.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2 items-center">
              <div className="flex-1">
                <Input
                  type="date"
                  value={periodStart}
                  onChange={e => setPeriodStart(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <span className="text-xs text-muted-foreground">to</span>
              <div className="flex-1">
                <Input
                  type="date"
                  value={periodEnd}
                  onChange={e => setPeriodEnd(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Metric inputs */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Metrics</Label>
            <p className="text-xs text-muted-foreground mt-1">Leave blank to skip any metric you don&apos;t have data for.</p>
            <div className="mt-3 space-y-3">
              {metrics.map(metric => (
                <div key={metric.key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-foreground">{metric.label}</label>
                    <span className="text-xs text-muted-foreground">{metric.description}</span>
                  </div>
                  <div className="relative">
                    {metric.type === 'currency' && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    )}
                    <Input
                      type="number"
                      step={metric.type === 'percentage' ? '0.01' : '1'}
                      min="0"
                      placeholder="—"
                      value={values[metric.key] ?? ''}
                      onChange={e => handleValue(metric.key, e.target.value)}
                      className={cn(
                        'h-9 text-sm',
                        metric.type === 'currency' && 'pl-7',
                        metric.type === 'percentage' && 'pr-8'
                      )}
                    />
                    {metric.type === 'percentage' && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving || success}>
              {success ? (
                <><Check className="h-4 w-4 mr-1.5" /> Saved</>
              ) : saving ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                'Save Data'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
