'use client'

import { useState, useEffect } from 'react'
import { Check, Loader2, Palette, Clock, MapPin } from 'lucide-react'
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

const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  // Australia & Pacific
  { value: 'Australia/Sydney',     label: 'Sydney, Melbourne (AEST/AEDT) UTC+10/+11' },
  { value: 'Australia/Brisbane',   label: 'Brisbane (AEST) UTC+10' },
  { value: 'Australia/Adelaide',   label: 'Adelaide (ACST/ACDT) UTC+9:30/+10:30' },
  { value: 'Australia/Perth',      label: 'Perth (AWST) UTC+8' },
  { value: 'Australia/Darwin',     label: 'Darwin (ACST) UTC+9:30' },
  { value: 'Pacific/Auckland',     label: 'Auckland (NZST/NZDT) UTC+12/+13' },
  // Asia
  { value: 'Asia/Singapore',       label: 'Singapore (SGT) UTC+8' },
  { value: 'Asia/Tokyo',           label: 'Tokyo (JST) UTC+9' },
  { value: 'Asia/Shanghai',        label: 'Shanghai, Beijing (CST) UTC+8' },
  { value: 'Asia/Hong_Kong',       label: 'Hong Kong (HKT) UTC+8' },
  { value: 'Asia/Dubai',           label: 'Dubai (GST) UTC+4' },
  { value: 'Asia/Kolkata',         label: 'Mumbai, Delhi (IST) UTC+5:30' },
  // Europe
  { value: 'Europe/London',        label: 'London (GMT/BST) UTC+0/+1' },
  { value: 'Europe/Paris',         label: 'Paris, Berlin, Rome (CET/CEST) UTC+1/+2' },
  { value: 'Europe/Amsterdam',     label: 'Amsterdam (CET/CEST) UTC+1/+2' },
  { value: 'Europe/Zurich',        label: 'Zurich (CET/CEST) UTC+1/+2' },
  // Americas
  { value: 'America/New_York',     label: 'New York (EST/EDT) UTC-5/-4' },
  { value: 'America/Chicago',      label: 'Chicago (CST/CDT) UTC-6/-5' },
  { value: 'America/Denver',       label: 'Denver (MST/MDT) UTC-7/-6' },
  { value: 'America/Los_Angeles',  label: 'Los Angeles (PST/PDT) UTC-8/-7' },
  { value: 'America/Toronto',      label: 'Toronto (EST/EDT) UTC-5/-4' },
  { value: 'America/Vancouver',    label: 'Vancouver (PST/PDT) UTC-8/-7' },
  { value: 'America/Sao_Paulo',    label: 'São Paulo (BRT) UTC-3' },
  // Africa & Middle East
  { value: 'Africa/Johannesburg',  label: 'Johannesburg (SAST) UTC+2' },
  { value: 'Africa/Cairo',         label: 'Cairo (EET) UTC+2' },
  // UTC
  { value: 'UTC',                  label: 'UTC (Coordinated Universal Time)' },
]

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

  // ── Slug state ────────────────────────────────────────────────────────────
  const [editSlug,      setEditSlug]      = useState(groupSlug)
  const [slugSaving,    setSlugSaving]    = useState(false)
  const [slugToast,     setSlugToast]     = useState<string | null>(null)
  const [slugError,     setSlugError]     = useState('')

  // ── Palette state ────────────────────────────────────────────────────────
  const [paletteSaving,     setPaletteSaving]     = useState(false)
  const [paletteToast,      setPaletteToast]      = useState<string | null>(null)
  const [localPaletteId,    setLocalPaletteId]    = useState(selectedPaletteId)

  // ── Timezone + location state ────────────────────────────────────────────
  const [timezone,        setTimezone]        = useState('Australia/Brisbane')
  const [location,        setLocation]        = useState('')
  const [tzSaving,        setTzSaving]        = useState(false)
  const [tzToast,         setTzToast]         = useState<string | null>(null)

  // ── Branding state (migration 047) ───────────────────────────────────────
  const [brandName,    setBrandName]    = useState('')
  const [brandColor,   setBrandColor]   = useState('#6366f1')
  const [logoUrl,      setLogoUrl]      = useState<string | null>(null)
  const [brandSaving,  setBrandSaving]  = useState(false)
  const [brandToast,   setBrandToast]   = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)

  // Keep edit group name in sync with parent
  useEffect(() => { setEditGroupName(groupName) }, [groupName])
  useEffect(() => { setEditSlug(groupSlug) }, [groupSlug])
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

    // Load group timezone + location + branding
    fetch('/api/groups/active').then(r => r.json()).then(json => {
      const grp = json.data?.group as {
        timezone?: string
        location?: string | null
        brand_name?: string | null
        brand_color?: string | null
        logo_url?: string | null
      } | undefined
      if (grp?.timezone)    setTimezone(grp.timezone)
      if (grp?.location)    setLocation(grp.location)
      if (grp?.brand_name)  setBrandName(grp.brand_name)
      if (grp?.brand_color) setBrandColor(grp.brand_color)
      if (grp?.logo_url)    setLogoUrl(grp.logo_url)
    }).catch(() => {})
  }, [])

  // Auto-clear toasts
  useEffect(() => {
    if (!groupNameToast) return
    const t = setTimeout(() => setGroupNameToast(null), 3000)
    return () => clearTimeout(t)
  }, [groupNameToast])

  useEffect(() => {
    if (!slugToast) return
    const t = setTimeout(() => setSlugToast(null), 3000)
    return () => clearTimeout(t)
  }, [slugToast])

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

  async function handleSaveSlug() {
    if (!groupId) return
    const slug = editSlug.trim().toLowerCase()
    setSlugError('')
    if (slug.length < 2) { setSlugError('Slug must be at least 2 characters'); return }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
      setSlugError('Only lowercase letters, numbers, and hyphens. No leading/trailing hyphens.')
      return
    }
    setSlugSaving(true)
    try {
      const res  = await fetch(`/api/groups/${groupId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ slug }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      setSlugToast('Slug updated')
    } catch (err) {
      setSlugError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSlugSaving(false)
    }
  }

  async function handleSaveBranding() {
    if (!groupId) return
    setBrandSaving(true)
    try {
      const res = await fetch(`/api/groups/${groupId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          brand_name:  brandName.trim() || null,
          brand_color: brandColor,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save branding')
      setBrandToast('Branding saved')
      setTimeout(() => setBrandToast(null), 2500)
    } catch (err) {
      setBrandToast(err instanceof Error ? err.message : 'Failed to save')
      setTimeout(() => setBrandToast(null), 4000)
    } finally {
      setBrandSaving(false)
    }
  }

  async function handleUploadLogo(file: File) {
    if (!groupId) return
    if (file.size > 1024 * 1024) {
      setBrandToast('Logo too large — max 1 MB')
      setTimeout(() => setBrandToast(null), 4000)
      return
    }
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch(`/api/groups/${groupId}/logo`, { method: 'POST', body: fd })
      const json = await res.json() as { data?: { logo_url: string }; error?: string }
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Upload failed')
      setLogoUrl(json.data.logo_url)
      setBrandToast('Logo updated')
      setTimeout(() => setBrandToast(null), 2500)
    } catch (err) {
      setBrandToast(err instanceof Error ? err.message : 'Upload failed')
      setTimeout(() => setBrandToast(null), 4000)
    } finally {
      setLogoUploading(false)
    }
  }

  async function handleRemoveLogo() {
    if (!groupId) return
    setLogoUploading(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/logo`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove logo')
      setLogoUrl(null)
      setBrandToast('Logo removed')
      setTimeout(() => setBrandToast(null), 2500)
    } catch (err) {
      setBrandToast(err instanceof Error ? err.message : 'Failed to remove')
      setTimeout(() => setBrandToast(null), 4000)
    } finally {
      setLogoUploading(false)
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

  async function handleSaveTimezone() {
    if (!groupId) return
    setTzSaving(true)
    try {
      const res  = await fetch(`/api/groups/${groupId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ timezone, location: location.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      setTzToast('Timezone saved')
    } catch (err) {
      setTzToast(err instanceof Error ? err.message : 'Failed to save timezone')
    } finally {
      setTzSaving(false)
    }
  }

  // Live preview of current time in selected timezone
  let tzCurrentTime = ''
  try {
    tzCurrentTime = new Intl.DateTimeFormat('en-AU', {
      timeZone:  timezone,
      weekday:   'long',
      hour:      'numeric',
      minute:    '2-digit',
      hour12:    true,
    }).format(new Date())
  } catch { /* invalid tz — fall through */ }

  // Auto-clear timezone toast
  useEffect(() => {
    if (!tzToast) return
    const t = setTimeout(() => setTzToast(null), 3000)
    return () => clearTimeout(t)
  }, [tzToast])

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
            </>
          ) : (
            <p className="text-sm font-medium text-foreground">{groupName}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Group URL Slug ──────────────────────────────────────────────────── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Group URL Slug</CardTitle>
            <CardDescription>Used in your NavHub URLs. Auto-generated from your group name.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={editSlug}
                onChange={e => { setEditSlug(e.target.value.toLowerCase()); setSlugError('') }}
                placeholder="my-group"
                className="flex-1 font-mono text-sm"
              />
              <Button
                size="sm"
                onClick={handleSaveSlug}
                disabled={slugSaving || editSlug.trim() === groupSlug}
              >
                {slugSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
            {slugError && (
              <p className="text-xs text-destructive">{slugError}</p>
            )}
            {slugToast && (
              <p className="text-xs flex items-center gap-1 text-green-600 dark:text-green-400">
                <Check className="h-3.5 w-3.5" /> {slugToast}
              </p>
            )}
            {editSlug && !slugError && (
              <p className="text-xs text-muted-foreground font-mono">
                Preview: <span className="text-foreground">app.navhub.co/<span className="text-primary">{editSlug || groupSlug}</span>/dashboard</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Branding (admin only) — migration 047 ───────────────────────────── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              Branding
            </CardTitle>
            <CardDescription>
              Customise how the app appears to your team. Leave blank to use NavHub defaults.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">App Name</Label>
              <Input
                id="brand-name"
                value={brandName}
                onChange={e => setBrandName(e.target.value.slice(0, 30))}
                placeholder="e.g. AxisHub"
                maxLength={30}
              />
              <p className="text-xs text-muted-foreground">
                Appears in the sidebar, browser tab, and emails. Defaults to <span className="font-medium">NavHub</span>.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand-color">Primary Colour</Label>
              <div className="flex items-center gap-3">
                <input
                  id="brand-color"
                  type="color"
                  value={brandColor}
                  onChange={e => setBrandColor(e.target.value.toLowerCase())}
                  className="h-10 w-14 rounded border border-input cursor-pointer bg-transparent"
                />
                <Input
                  value={brandColor}
                  onChange={e => setBrandColor(e.target.value.toLowerCase())}
                  placeholder="#6366f1"
                  className="font-mono text-sm w-32"
                />
                <span className="text-xs text-muted-foreground">
                  Used for active states, buttons, and accent elements.
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center h-16 w-32 rounded-md border border-dashed border-input bg-muted/30 overflow-hidden">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="Logo" className="max-h-14 max-w-[112px] object-contain" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">No logo</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={logoUploading}
                      onClick={() => {
                        const i = document.createElement('input')
                        i.type = 'file'
                        i.accept = 'image/png,image/svg+xml,image/webp,image/jpeg'
                        i.onchange = () => { if (i.files?.[0]) void handleUploadLogo(i.files[0]) }
                        i.click()
                      }}
                    >
                      {logoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      {logoUrl ? 'Replace logo' : 'Upload logo'}
                    </Button>
                    {logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={logoUploading}
                        onClick={() => void handleRemoveLogo()}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PNG, SVG, WebP or JPEG. Max 1 MB. Recommended 240×80px, transparent background.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              {brandToast && (
                <span className={cn(
                  'text-xs',
                  brandToast.toLowerCase().includes('failed') || brandToast.toLowerCase().includes('large')
                    ? 'text-destructive'
                    : 'text-green-600',
                )}>
                  {brandToast}
                </span>
              )}
              <Button size="sm" onClick={() => void handleSaveBranding()} disabled={brandSaving}>
                {brandSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                Save Branding
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* ── Timezone + Location (admin only) ────────────────────────────────── */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Timezone &amp; Location
            </CardTitle>
            <CardDescription>
              Used for scheduled agent runs and other time-sensitive features.
              Applies to the whole group.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="group-location" className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Location
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="group-location"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Sydney, Australia"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="group-timezone" className="text-sm font-medium text-foreground">Timezone</Label>
              <select
                id="group-timezone"
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {TIMEZONE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {tzCurrentTime && (
                <p className="text-xs text-muted-foreground">
                  Current time in this timezone: <span className="text-foreground font-medium">{tzCurrentTime}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={() => void handleSaveTimezone()} disabled={tzSaving || !groupId} size="sm">
                {tzSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Saving…</> : 'Save'}
              </Button>
              {tzToast && (
                <span className="text-xs flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" /> {tzToast}
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
