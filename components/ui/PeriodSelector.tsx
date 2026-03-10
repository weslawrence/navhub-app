'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildPeriodOptions } from '@/lib/periods'

type PeriodMode = 'month' | 'quarter' | 'fy_year'

interface PeriodSelectorProps {
  value:        string                 // YYYY-MM — current selected period
  onChange:     (period: string) => void
  fyEndMonth?:  number                 // 1–12, default 6 (June)
  className?:   string
  /** Which modes to show; default all three */
  modes?:       PeriodMode[]
}

const MODE_LABELS: Record<PeriodMode, string> = {
  month:   'Month',
  quarter: 'Quarter',
  fy_year: 'FY Year',
}

export default function PeriodSelector({
  value,
  onChange,
  fyEndMonth = 6,
  className,
  modes      = ['month', 'quarter', 'fy_year'],
}: PeriodSelectorProps) {
  const [activeMode, setActiveMode] = useState<PeriodMode>(() => {
    // Infer initial mode from options
    return modes[0]
  })

  const allOptions = buildPeriodOptions(fyEndMonth, 36)
  const filtered   = allOptions.filter(o => o.type === activeMode)

  // If current value isn't in the filtered list, pick the first
  const currentOption = filtered.find(o => o.value === value) ?? filtered[0]

  function handleModeChange(mode: PeriodMode) {
    setActiveMode(mode)
    // Switch to the first option in the new mode
    const first = allOptions.filter(o => o.type === mode)[0]
    if (first) onChange(first.value)
  }

  function handleValueChange(val: string) {
    onChange(val)
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Mode toggle */}
      {modes.length > 1 && (
        <div className="flex gap-1 rounded-md border p-0.5 bg-muted/30 w-fit">
          {modes.map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => handleModeChange(mode)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                activeMode === mode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      )}

      {/* Period dropdown */}
      <div className="relative">
        <select
          value={currentOption?.value ?? value}
          onChange={e => handleValueChange(e.target.value)}
          className="appearance-none h-9 w-full rounded-md border border-input bg-background px-3 pr-8 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {filtered.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  )
}
