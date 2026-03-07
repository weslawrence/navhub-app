'use client'

import { useState, useEffect } from 'react'
import { Settings, Palette, SlidersHorizontal, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button }    from '@/components/ui/button'
import { Label }     from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { NumberFormat, SupportedCurrency } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string; example: string }[] = [
  { value: 'thousands', label: 'Thousands',    example: '$1,234k' },
  { value: 'full',      label: 'Full',         example: '$1,234,000' },
  { value: 'smart',     label: 'Smart',        example: '$1.2m / $234k' },
]

const CURRENCY_OPTIONS: { value: SupportedCurrency; label: string }[] = [
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'NZD', label: 'NZD — New Zealand Dollar' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
]

// ─── Settings Page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // ── State ─────────────────────────────────────────────────────────────────

  const [numberFormat, setNumberFormat] = useState<NumberFormat>('thousands')
  const [currency,     setCurrency]     = useState<SupportedCurrency>('AUD')
  const [prefsSaving,  setPrefsSaving]  = useState(false)
  const [prefsToast,   setPrefsToast]   = useState<string | null>(null)

  const [groupId,       setGroupId]      = useState<string | null>(null)
  const [groupName,     setGroupName]    = useState('')
  const [groupSlug,     setGroupSlug]    = useState('')
  const [groupColor,    setGroupColor]   = useState('#0ea5e9')
  const [isAdmin,       setIsAdmin]      = useState(false)
  const [colorSaving,   setColorSaving]  = useState(false)
  const [colorToast,    setColorToast]   = useState<string | null>(null)

  const [userEmail,    setUserEmail]    = useState('')
  const [userRole,     setUserRole]     = useState('')

  // ── Load initial data ────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/auth/session-info').catch(() => ({ data: null })),
    ]).then(([prefsJson]) => {
      if (prefsJson.data) {
        setNumberFormat(prefsJson.data.number_format ?? 'thousands')
        setCurrency(prefsJson.data.currency ?? 'AUD')
      }
    }).catch(() => {})

    // Load group info via supabase client-side — read from a simple API endpoint
    fetch('/api/groups/active').then(r => r.json()).then(json => {
      if (json.data) {
        setGroupId(json.data.group.id)
        setGroupName(json.data.group.name)
        setGroupSlug(json.data.group.slug)
        setGroupColor(json.data.group.primary_color ?? '#0ea5e9')
        setIsAdmin(json.data.is_admin)
        setUserEmail(json.data.user_email ?? '')
        setUserRole(json.data.role ?? '')
      }
    }).catch(() => {})
  }, [])

  // ── Auto-clear toasts ────────────────────────────────────────────────────

  useEffect(() => {
    if (!prefsToast) return
    const t = setTimeout(() => setPrefsToast(null), 3000)
    return () => clearTimeout(t)
  }, [prefsToast])

  useEffect(() => {
    if (!colorToast) return
    const t = setTimeout(() => setColorToast(null), 3000)
    return () => clearTimeout(t)
  }, [colorToast])

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleSavePrefs() {
    setPrefsSaving(true)
    try {
      const res  = await fetch('/api/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ currency, number_format: numberFormat }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      setPrefsToast('Preferences saved')
    } catch (err) {
      setPrefsToast(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setPrefsSaving(false)
    }
  }

  async function handleSaveColor() {
    if (!groupId) return
    setColorSaving(true)
    try {
      const res  = await fetch(`/api/groups/${groupId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ primary_color: groupColor }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')

      // Update the CSS var immediately without page reload
      document.documentElement.style.setProperty('--group-primary', groupColor)
      setColorToast('Group colour updated')
    } catch (err) {
      setColorToast(err instanceof Error ? err.message : 'Failed to update colour')
    } finally {
      setColorSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6" /> Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Display preferences and group configuration
        </p>
      </div>

      {/* ── Section 1: Display Preferences ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            Display Preferences
          </CardTitle>
          <CardDescription>
            Controls how numbers are formatted across the dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Number format */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Number format</Label>
            <div className="space-y-2">
              {NUMBER_FORMAT_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                    numberFormat === opt.value
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40 group-hover:border-primary/60'
                  }`}>
                    {numberFormat === opt.value && (
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <input
                    type="radio"
                    value={opt.value}
                    checked={numberFormat === opt.value}
                    onChange={() => setNumberFormat(opt.value)}
                    className="sr-only"
                  />
                  <span className="text-sm">{opt.label}</span>
                  <span className="text-xs text-muted-foreground font-mono ml-auto">{opt.example}</span>
                </label>
              ))}
            </div>
          </div>

          <Separator />

          {/* Currency */}
          <div className="space-y-2">
            <Label htmlFor="currency-select" className="text-sm font-medium">Currency</Label>
            <select
              id="currency-select"
              value={currency}
              onChange={e => setCurrency(e.target.value as SupportedCurrency)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {CURRENCY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Save + toast */}
          <div className="flex items-center gap-3">
            <Button onClick={handleSavePrefs} disabled={prefsSaving} size="sm">
              {prefsSaving ? 'Saving…' : 'Save preferences'}
            </Button>
            {prefsToast && (
              <span className="text-xs flex items-center gap-1 text-green-600 dark:text-green-400">
                <Check className="h-3.5 w-3.5" /> {prefsToast}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Group Appearance (admin only) ─────────────────────── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              Group Appearance
            </CardTitle>
            <CardDescription>
              Colour applies to all users in this group · <span className="font-medium">{groupName}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Colour picker */}
            <div className="space-y-2">
              <Label htmlFor="group-color" className="text-sm font-medium">Primary colour</Label>
              <div className="flex items-center gap-3">
                {/* Preview swatch */}
                <div
                  className="h-10 w-10 rounded-md ring-1 ring-border shadow-sm flex-shrink-0 transition-colors"
                  style={{ backgroundColor: groupColor }}
                />
                <input
                  id="group-color"
                  type="color"
                  value={groupColor}
                  onChange={e => setGroupColor(e.target.value)}
                  className="h-10 w-24 rounded-md border border-input cursor-pointer p-1"
                />
                <span className="text-sm font-mono text-muted-foreground">{groupColor}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Used for buttons, links, and accent elements across the dashboard.
              </p>
            </div>

            {/* Save + toast */}
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveColor} disabled={colorSaving || !groupId} size="sm">
                {colorSaving ? 'Saving…' : 'Save colour'}
              </Button>
              {colorToast && (
                <span className="text-xs flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" /> {colorToast}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Section 3: Account info ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Your login details and group membership</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="Email"      value={userEmail || '—'} />
          <Row label="Group"      value={groupName || '—'} />
          <Row label="Slug"       value={groupSlug || '—'} />
          <Row label="Your role"  value={userRole || '—'} />
          <Row
            label="Group colour"
            value={
              <span className="flex items-center gap-2">
                <span
                  className="h-4 w-4 rounded-sm ring-1 ring-border flex-shrink-0"
                  style={{ backgroundColor: groupColor }}
                />
                {groupColor}
              </span>
            }
          />
        </CardContent>
      </Card>

      {!isAdmin && (
        <p className="text-sm text-muted-foreground">
          Group appearance settings can only be changed by group administrators.
        </p>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
