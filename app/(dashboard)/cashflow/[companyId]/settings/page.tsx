'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const WEEK_DAYS = [
  { value: 0, label: 'Sunday'    },
  { value: 1, label: 'Monday'    },
  { value: 2, label: 'Tuesday'   },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday'  },
  { value: 5, label: 'Friday'    },
  { value: 6, label: 'Saturday'  },
]

export default function CashflowSettingsPage() {
  const params    = useParams()
  const companyId = params?.companyId as string

  const [openingBalance, setOpeningBalance] = useState('0')
  const [weekStartDay,   setWeekStartDay]   = useState(1)
  const [arLagDays,      setArLagDays]      = useState(30)
  const [apLagDays,      setApLagDays]      = useState(30)
  const [currency,       setCurrency]       = useState('AUD')
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [saved,          setSaved]          = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    try {
      const res  = await fetch(`/api/cashflow/${companyId}/settings`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const s = json.data
      setOpeningBalance(String(s.opening_balance_cents / 100))
      setWeekStartDay(s.week_start_day)
      setArLagDays(s.ar_lag_days)
      setApLagDays(s.ap_lag_days)
      setCurrency(s.currency)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading settings')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { loadSettings() }, [loadSettings])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/cashflow/${companyId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opening_balance_cents: Math.round(parseFloat(openingBalance) * 100),
          week_start_day:        weekStartDay,
          ar_lag_days:           arLagDays,
          ap_lag_days:           apLagDays,
          currency,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/cashflow/${companyId}`} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Cash Flow Settings</h1>
          <p className="text-xs text-muted-foreground">Configure the 13-week forecast defaults</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forecast Settings</CardTitle>
          <CardDescription>These settings apply to this company&apos;s cash flow forecast.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            {/* Opening balance */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Opening Balance ($)</label>
              <p className="text-xs text-muted-foreground">Current bank balance — the starting position for week 1</p>
              <input
                type="number"
                value={openingBalance}
                onChange={e => setOpeningBalance(e.target.value)}
                step="0.01"
                className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            {/* Week start day */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Week Start Day</label>
              <select
                value={weekStartDay}
                onChange={e => setWeekStartDay(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {WEEK_DAYS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Currency */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Currency</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {['AUD', 'NZD', 'USD', 'GBP', 'SGD'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* AR / AP lag */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">AR Lag Days</label>
                <p className="text-xs text-muted-foreground">Default days until payment received</p>
                <input
                  type="number"
                  value={arLagDays}
                  onChange={e => setArLagDays(Number(e.target.value))}
                  min="0"
                  className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">AP Lag Days</label>
                <p className="text-xs text-muted-foreground">Default days until payment due</p>
                <input
                  type="number"
                  value={apLagDays}
                  onChange={e => setApLagDays(Number(e.target.value))}
                  min="0"
                  className="w-full px-3 py-2 rounded-md border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-end gap-3 pt-2">
              {saved && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                </span>
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--palette-primary)' }}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Settings
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
