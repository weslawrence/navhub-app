'use client'

import { useState } from 'react'
import { Button }   from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(isoDate: string): string {
  const diff  = Date.now() - new Date(isoDate).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Returns YYYY-MM strings for the last `n` months ending at current month */
function lastNMonthStrings(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SyncButtonProps {
  connectionId: string
  lastSyncedAt?: string | null
  // reportType accepted for backward compat but both buttons are always shown
  reportType?:   'profit_loss' | 'balance_sheet'
}

const ROUTE_MAP = {
  profit_loss:   '/api/xero/sync/profit-loss',
  balance_sheet: '/api/xero/sync/balance-sheet',
} as const

export default function SyncButton({ connectionId, lastSyncedAt }: SyncButtonProps) {
  const availableMonths = lastNMonthStrings(6)
  const currentMonth    = availableMonths[0]

  const [period,    setPeriod]    = useState(currentMonth)
  const [loadingPL, setLoadingPL] = useState(false)
  const [loadingBS, setLoadingBS] = useState(false)
  const [result,    setResult]    = useState<string | null>(null)

  async function handleSync(type: 'profit_loss' | 'balance_sheet') {
    const setLoading = type === 'profit_loss' ? setLoadingPL : setLoadingBS
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(ROUTE_MAP[type], {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ connection_id: connectionId, period }),
      })
      const data = await res.json()
      setResult(
        data.error
          ? `Error: ${data.error}`
          : `${type === 'profit_loss' ? 'P&L' : 'Balance Sheet'} synced ✓`
      )
    } catch {
      setResult('Sync failed — check connection')
    } finally {
      setLoading(false)
    }
  }

  const anyLoading = loadingPL || loadingBS

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Period selector */}
        <select
          value={period}
          onChange={e => { setPeriod(e.target.value); setResult(null) }}
          disabled={anyLoading}
          className="h-8 rounded-md border border-input bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {availableMonths.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Sync P&L */}
        <Button
          onClick={() => handleSync('profit_loss')}
          disabled={anyLoading}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loadingPL ? 'animate-spin' : ''}`} />
          {loadingPL ? 'Syncing…' : 'Sync P&L'}
        </Button>

        {/* Sync Balance Sheet */}
        <Button
          onClick={() => handleSync('balance_sheet')}
          disabled={anyLoading}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loadingBS ? 'animate-spin' : ''}`} />
          {loadingBS ? 'Syncing…' : 'Sync Balance Sheet'}
        </Button>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {lastSyncedAt && (
          <span>Last synced: {relativeTime(lastSyncedAt)}</span>
        )}
        {result && (
          <span className={result.startsWith('Error') || result.startsWith('Sync failed')
            ? 'text-destructive'
            : 'text-emerald-600 dark:text-emerald-400'
          }>
            {result}
          </span>
        )}
      </div>
    </div>
  )
}
