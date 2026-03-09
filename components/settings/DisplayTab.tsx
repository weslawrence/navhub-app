'use client'

import { useState, useEffect } from 'react'
import { Check, Loader2, Palette } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label }     from '@/components/ui/label'
import { Input }     from '@/components/ui/input'
import { Button }    from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { PALETTES, getPalette } from '@/lib/themes'
import { monthName } from '@/lib/periods'
import { cn }        from '@/lib/utils'
import type { NumberFormat, SupportedCurrency } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string; example: string }[] = [
  { value: 'thousands', label: 'Thousands', example: '$1,234k'     },
  { value: 'full',      label: 'Full',      example: '$1,234,000'  },
  { value: 'smart',     label: 'Smart',     example: '$1.2m / $234k' },
]

const CURRENCY_OPTIONS: { value: SupportedCurrency; label: string }[] = [
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'NZD', label: 'NZD — New Zealand Dollar' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'SGD', label: 'SGD — Singapore Dollar' },
]

const FY_END_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: monthName(i + 1),
}))

// ─── Props ────────────────────────────────────────────────────────────────────

interface DisplayTabProps {
  groupId:           string | null
  groupName:         string
  groupSlug:         string
  isAdmin:           boolean
  selectedPaletteId: string
  onGroupNameChange: (name: string) => void
  onPaletteChange:   (id: string)   => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DisplayTab({
  groupId,
  groupName,
  groupSlug,
  isAdmin,
  selectedPaletteId,
  onGroupNameChange,
  onPaletteChange,
}: DisplayTabProps) {

  // ── User prefs state ─────────────────────────────────────────────────────
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('thousands')
  const [currency,     setCurrency]     = useState<SupportedCurrency>('AUD')
  const [fyEndMonth,   setFyEndMonth]   = useState(6)
  const [prefsSaving,  setPrefsSaving]  = useState(false)
  const [prefsStatus,  setPrefsStatus]  = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [prefsError,   setPrefsError]   = useState('')

  // ── Group name state ─────────────────────────────────────────────────────
  const [editGroupName,   setEditGroupName]   = useState(groupName)
  const [groupNameSaving, setGroupNameSaving] = useState(false)
  const [groupNameToast,  setGroupNameToast]  = useState<string | null>(null)

  // ── Palette state ────────────────────────────────────────────────────────
  const [paletteSaving,     setPaletteSaving]     = useState(false)
  const [paletteToast,      setPaletteToast]      = useState<string | null>(null)
  const [localPaletteId,    setLocalPaletteId]    = useState(selectedPaletteId)

  // Keep edit group name in sync with parent
  useEffect(() => { setEditGroupName(groupName) }, [groupName])
  useEffect(() => { setLocalPaletteId(selectedPaletteId) }, [selectedPaletteId])

  // Load user prefs
  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(json => {
      if (json.data) {
        setNumberFormat(json.data.number_format ?? 'thousands')
        setCurrency(json.data.currency ?? 'AUD')
        setFyEndMonth(json.data.fy_end_month ?? 6)
      }
    }).catch(() => {})
  }, [])

  // Auto-clear toasts
  useEffect(() => {
    if (!groupNameToast) return
    const t = setTimeout(() => setGroupNameToast(null), 3000)
    return () => clearTimeout(t)
  }, [groupNameToast])

  useEffect(() => {
    if (!paletteToast) return
    const t = setTimeout(() => setPaletteToast(null), 3000)
    return () => clearTimeout(t)
  }, [paletteToast])

  useEffect(() => {
    if (prefsStatus !== 'saved') return
    const t = setTimeout(() => setPrefsStatus('idle'), 2000)
    return () => clearTimeout(t)
  }, [prefsStatus])

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleSavePrefs() {
    setPrefsSaving(true)
    setPrefsStatus('saving')
    try {
      const res  = await fetch('/api/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ currency, number_format: numberFormat, fy_end_month: fyEndMonth }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      setPrefsStatus('saved')
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : 'Failed to save')
      setPrefsStatus('error')
    } finally {
      setPrefsSaving(false)
    }
  }

  async function handleSaveGroupName() {
    if (!groupId) return
    const name = editGroupName.trim()
    if (name.length < 2) { setGroupNameToast('Name must be at least 2 characters'); return }
    setGroupNameSaving(true)
    try {
      const res  = await fetch(`/api/groups/${groupId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      onGroupNameChange(name)
      setGroupNameToast('Group name updated')
    } catch (err) {
      setGroupNameToast(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setGroupNameSaving(false)
    }
  }

  function handlePaletteSelect(id: string) {
    setLocalPaletteId(id)
    const palette = getPalette(id)
    document.documentElement.style.setProperty('--palette-primary',   palette.primary)
    document.documentElement.style.setProperty('--palette-secondary', palette.secondary)
    document.documentElement.style.setProperty('--palette-accent',    palette.accent)
    document.documentElement.style.setProperty('--palette-surface',   palette.surface)
    document.documentElement.style.setProperty('--group-primary',     palette.primary)
    onPaletteChange(id)
  }

  async function handleSavePalette() {
    if (!groupId) return
    setPaletteSaving(true)
    try {
      const res  = await fetch(`/api/groups/${groupId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ palette_id: localPaletteId }),
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

  const activePalette = getPalette(localPaletteId)

  return (
    <div className="space-y-5">

      {/* ── Group name ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Group Name</CardTitle>
          <CardDescription>The display name for this group</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isAdmin ? (
            <>
              <div className="flex gap-2">
                <Input
                  value={editGroupName}
                  onChange={e => setEditGroupName(e.target.value)}
                  placeholder="Group name"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleSaveGroupName}
                  disabled={groupNameSaving || editGroupName.trim() === groupName}
                >
                  {groupNameSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
              {groupNameToast && (
                <p className={cn(
                  'text-xs flex items-center gap-1',
                  groupNameToast.startsWith('Group name') ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                )}>
                  {groupNameToast.startsWith('Group name') && <Check className="h-3.5 w-3.5" />}
                  {groupNameToast}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Slug: <code className="font-mono">{groupSlug}</code></p>
            </>
          ) : (
            <p className="text-sm font-medium text-foreground">{groupName}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Colour palette (admin only) ─────────────────────────────────────── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              Colour Palette
            </CardTitle>
            <CardDescription>
              Applies to all users in this group. Selecting a palette previews it immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {PALETTES.map(palette => (
                <button
                  key={palette.id}
                  type="button"
                  onClick={() => handlePaletteSelect(palette.id)}
                  className={cn(
                    'relative p-3 rounded-lg border-2 text-left transition-all focus:outline-none',
                    localPaletteId === palette.id
                      ? 'border-primary ring-1 ring-primary/30 bg-primary/5'
                      : 'border-border hover:border-muted-foreground/50'
                  )}
                >
                  <div className="flex gap-1 mb-2">
                    <div className="h-5 w-5 rounded shadow-sm" style={{ backgroundColor: palette.primary }} />
                    <div className="h-5 w-5 rounded shadow-sm" style={{ backgroundColor: palette.secondary }} />
                    <div className="h-5 w-5 rounded shadow-sm" style={{ backgroundColor: palette.accent }} />
                    <div className="h-5 w-5 rounded shadow-sm" style={{ backgroundColor: palette.surface }} />
                  </div>
                  <p className="text-sm font-medium text-foreground">{palette.name}</p>
                  {localPaletteId === palette.id && (
                    <Check className="absolute top-2 right-2 h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
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

      {/* ── User preferences ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display Preferences</CardTitle>
          <CardDescription>Controls how numbers and dates are displayed across the dashboard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Number format */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">Number format</Label>
            <div className="space-y-2">
              {NUMBER_FORMAT_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                  <div className={cn(
                    'h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors',
                    numberFormat === opt.value
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground/40 group-hover:border-primary/60'
                  )}>
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
                  <span className="text-sm text-foreground">{opt.label}</span>
                  <span className="text-xs text-muted-foreground font-mono ml-auto">{opt.example}</span>
                </label>
              ))}
            </div>
          </div>

          <Separator />

          {/* Currency */}
          <div className="space-y-2">
            <Label htmlFor="currency-select" className="text-sm font-medium text-foreground">Currency</Label>
            <select
              id="currency-select"
              value={currency}
              onChange={e => setCurrency(e.target.value as SupportedCurrency)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {CURRENCY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <Separator />

          {/* Financial Year Ending */}
          <div className="space-y-2">
            <Label htmlFor="fy-select" className="text-sm font-medium text-foreground">Financial Year Ending</Label>
            <p className="text-xs text-muted-foreground">
              The month your financial year ends. Used to calculate quarters and YTD figures.
            </p>
            <select
              id="fy-select"
              value={fyEndMonth}
              onChange={e => setFyEndMonth(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {FY_END_MONTH_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Currently: FY ends {monthName(fyEndMonth)}, starts {monthName((fyEndMonth % 12) + 1)}
            </p>
          </div>

          {/* Save button — primary colour, bottom-right, with loading + saved state */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {prefsStatus === 'saved' && (
              <span className="text-xs flex items-center gap-1 text-green-600 dark:text-green-400">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
            {prefsStatus === 'error' && (
              <span className="text-xs text-destructive">{prefsError}</span>
            )}
            <button
              type="button"
              onClick={handleSavePrefs}
              disabled={prefsSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--palette-primary)' }}
            >
              {prefsSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {prefsSaving ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>

        </CardContent>
      </Card>

      {/* Active palette info */}
      <p className="text-xs text-muted-foreground px-1">
        Active palette: <span className="font-medium text-foreground">{activePalette.name}</span>
        <span className="ml-2 inline-flex gap-1">
          <span className="h-3 w-3 rounded-sm ring-1 ring-border inline-block" style={{ backgroundColor: activePalette.primary }} />
          <span className="h-3 w-3 rounded-sm ring-1 ring-border inline-block" style={{ backgroundColor: activePalette.accent }} />
        </span>
      </p>

    </div>
  )
}
