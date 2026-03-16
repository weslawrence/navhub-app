'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleSectionProps {
  title:          string
  badge?:         string
  defaultOpen?:   boolean
  children:       React.ReactNode
  className?:     string
  headerClassName?: string
}

export default function CollapsibleSection({
  title,
  badge,
  defaultOpen = true,
  children,
  className,
  headerClassName,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden', className)}>
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center gap-2 px-4 py-3 text-left transition-colors',
          'hover:bg-muted/30',
          headerClassName,
        )}
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex-1 select-none">
          {title}
        </span>
        {badge && (
          <span className="text-xs text-muted-foreground/60 truncate max-w-[280px] select-none">
            {badge}
          </span>
        )}
      </button>

      {/* Smooth expand/collapse via CSS grid trick */}
      <div
        className={cn(
          'grid transition-all duration-200 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
