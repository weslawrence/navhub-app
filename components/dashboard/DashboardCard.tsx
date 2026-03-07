'use client'

import { type LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface DashboardCardProps {
  title:      string
  icon:       LucideIcon
  subtitle?:  string
  children:   React.ReactNode
  isLoading?: boolean
  error?:     string | null
  className?: string
  footer?:    React.ReactNode
}

export function DashboardCard({
  title,
  icon: Icon,
  subtitle,
  children,
  isLoading = false,
  error     = null,
  className,
  footer,
}: DashboardCardProps) {
  return (
    <Card
      className={cn('flex flex-col', className)}
      style={{ borderLeft: '3px solid var(--palette-primary)' }}
    >
      {/* Header */}
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary flex-shrink-0">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold leading-tight">{title}</CardTitle>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Body */}
      <CardContent className="flex-1 pt-0">
        {isLoading ? (
          <div className="space-y-2.5 pt-1">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-4 rounded bg-muted animate-pulse',
                  i % 3 === 2 ? 'w-2/3' : 'w-full'
                )}
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        ) : (
          children
        )}
      </CardContent>

      {/* Footer */}
      {footer && !isLoading && !error && (
        <div className="px-6 pb-4 border-t pt-3 mt-auto flex-shrink-0">
          {footer}
        </div>
      )}
    </Card>
  )
}
