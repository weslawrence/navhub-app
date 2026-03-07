'use client'

import { useState, useEffect } from 'react'
import { Settings, Palette, SlidersHorizontal, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button }    from '@/components/ui/button'
import { Label }     from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { PALETTES, getPalette } from '@/lib/themes'
import { cn } from '@/lib/utils'
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
  const [isAdmin,       setIsAdmin]      = useState(false)
  const [paletteSaving, setPaletteSaving] = useState(false)
  const [paletteToast,  setPaletteToast] = useState<string | null>(null)
  const [selectedPaletteId, setSelectedPaletteId] = useState<string>('ocean')

  const [userEmail,    setUserEmail]    = useState('')
  const [userRole,     setUserRole]     = useState('')

  // ── Load initial data ────────────────────────────────────────────────────

  useEffect(() => {
    // Load user preferences
    fetch('/api/settings').then(r => r.json()).then(json => {
      if (json.data) {
        setNumberFormat(json.data.number_format ?? 'thousands')
        setCurrency(json.data.currency ?? 'AUD')
      }
    }).catch(() => {})

    // Load group info via API
    fetch('/api/groups/active').then(r => r.json()).then(json => {
      if (json.data) {
        setGroupId(json.data.group.id)
        setGroupName(json.data.group.name)
        setGroupSlug(json.data.group.slug)
        setIsAdmin(json.data.is_admin)
        setUserEmail(json.data.user_email ?? '')
        setUserRole(json.data.role ?? '')
        setSelectedPaletteId(json.data.group.palette_id ?? 'ocean')
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
    if (!paletteToast) return
    const t = setTimeout(() => setPaletteToast(null), 3000)
    return () => clearTimeout(t)
  }, [paletteToast])

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

  function handlePaletteSelect(id: string) {
    setSelectedPaletteId(id)
    // Preview palette immediately by updating CSS vars
    const palette = getPalette(id)
    document.documentElement.style.setProperty('--palette-primary',   palette.primary)
    document.documentElement.style.setProperty('--palette-secondary', palette.secondary)
    document.documentElement.style.setProperty('--palette-accent',    palette.accent)
    document.documentElement.style.setProperty('--palette-surface',   palette.surface)
    document.documentElement.style.setProperty('--group-primary',     palette.primary)
  }

  async function handleSavePalette() {
    if (!groupId) return
    setPaletteSaving(true)
    try {
      const res  = await fetch(`/api/groups/${groupId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ palette_id: selectedPaletteId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      setPaletteToast('Palette updated')
    } catch (err) {
      setPaletteToast(err instanceof Error ? err.message : 'Failed to update palette')
    } finally {
      setPaletteSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const activePalette = getPalette(selectedPaletteId)

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
              Colour palette applies to all users in this group · <span className="font-medium">{groupName}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Palette selector */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Colour palette</Label>
              <div className="grid grid-cols-2 gap-3">
                {PALETTES.map(palette => (
                  <button
                    key={palette.id}
                    type="button"
                    onClick={() => handlePaletteSelect(palette.id)}
                    className={cn(
                      'relative p-3 rounded-lg border-2 text-left transition-all focus:outline-none',
                      selectedPaletteId === palette.id
                        ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    )}
                  >
                    {/* Colour swatches */}
                    <div className="flex gap-1 mb-2">
                      <div className="h-5 w-5 rounded shadow-sm" style={{ backgroundColor: palette.primary }} />
                      <div className="h-5 w-5 rounded shadow-sm" style={{ backgroundColor: palette.secondary }} />
                      <div className="h-5 w-5 rounded shadow-sm" style={{ backgroundColor: palette.accent }} />
                      <div className="h-5 w-5 rounded shadow-sm" style={{ backgroundColor: palette.surface }} />
                    </div>
                    <p className="text-sm font-medium">{palette.name}</p>
                    {selectedPaletteId === palette.id && (
                      <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Selecting a palette previews it immediately. Click <strong>Save palette</strong> to persist for all users.
              </p>
            </div>

            {/* Save + toast */}
            <div className="flex items-center gap-3">
              <Button onClick={handleSavePalette} disabled={paletteSaving || !groupId} size="sm">
                {paletteSaving ? 'Saving…' : 'Save palette'}
              </Button>
              {paletteToast && (
                <span className="text-xs flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" /> {paletteToast}
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
            label="Active palette"
            value={
              <span className="flex items-center gap-2">
                <span className="flex gap-1">
                  <span className="h-3.5 w-3.5 rounded-sm ring-1 ring-border flex-shrink-0" style={{ backgroundColor: activePalette.primary }} />
                  <span className="h-3.5 w-3.5 rounded-sm ring-1 ring-border flex-shrink-0" style={{ backgroundColor: activePalette.accent }} />
                </span>
                {activePalette.name}
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
