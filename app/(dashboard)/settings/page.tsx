'use client'

import { useState, useEffect, useCallback } from 'react'
import { Settings, Palette, SlidersHorizontal, Users, Check, Plus, X, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button }    from '@/components/ui/button'
import { Input }     from '@/components/ui/input'
import { Label }     from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { PALETTES, getPalette } from '@/lib/themes'
import { cn } from '@/lib/utils'
import type { NumberFormat, SupportedCurrency, GroupMember, GroupInvite } from '@/lib/types'

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

const ROLE_OPTIONS = [
  { value: 'group_admin',     label: 'Group Admin' },
  { value: 'company_viewer',  label: 'Company Viewer' },
  { value: 'division_viewer', label: 'Division Viewer' },
]

const INVITE_ROLE_OPTIONS = [
  { value: 'group_admin',     label: 'Group Admin' },
  { value: 'company_viewer',  label: 'Company Viewer' },
  { value: 'division_viewer', label: 'Division Viewer' },
]

type Tab = 'Display' | 'Group' | 'Members'

// ─── Settings Page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('Display')

  // ── Display prefs state ──────────────────────────────────────────────────
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('thousands')
  const [currency,     setCurrency]     = useState<SupportedCurrency>('AUD')
  const [prefsSaving,  setPrefsSaving]  = useState(false)
  const [prefsToast,   setPrefsToast]   = useState<string | null>(null)

  // ── Group state ──────────────────────────────────────────────────────────
  const [groupId,           setGroupId]           = useState<string | null>(null)
  const [groupName,         setGroupName]         = useState('')
  const [groupSlug,         setGroupSlug]         = useState('')
  const [editGroupName,     setEditGroupName]     = useState('')
  const [isAdmin,           setIsAdmin]           = useState(false)
  const [paletteSaving,     setPaletteSaving]     = useState(false)
  const [paletteToast,      setPaletteToast]      = useState<string | null>(null)
  const [selectedPaletteId, setSelectedPaletteId] = useState<string>('ocean')
  const [groupNameSaving,   setGroupNameSaving]   = useState(false)
  const [groupNameToast,    setGroupNameToast]    = useState<string | null>(null)

  // ── Account info ─────────────────────────────────────────────────────────
  const [userEmail, setUserEmail] = useState('')
  const [userRole,  setUserRole]  = useState('')

  // ── New group state ──────────────────────────────────────────────────────
  const [showNewGroup,   setShowNewGroup]   = useState(false)
  const [newGroupName,   setNewGroupName]   = useState('')
  const [newGroupSaving, setNewGroupSaving] = useState(false)
  const [newGroupToast,  setNewGroupToast]  = useState<string | null>(null)

  // ── Members state ────────────────────────────────────────────────────────
  const [members,       setMembers]       = useState<GroupMember[]>([])
  const [invites,       setInvites]       = useState<GroupInvite[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [membersLoading, setMembersLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null)
  const [roleSaving,    setRoleSaving]    = useState<string | null>(null)

  // ── Invite state ─────────────────────────────────────────────────────────
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole,  setInviteRole]  = useState('company_viewer')
  const [inviteSaving, setInviteSaving] = useState(false)
  const [inviteToast,  setInviteToast]  = useState<string | null>(null)

  // ── Load initial data ────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(json => {
      if (json.data) {
        setNumberFormat(json.data.number_format ?? 'thousands')
        setCurrency(json.data.currency ?? 'AUD')
      }
    }).catch(() => {})

    fetch('/api/groups/active').then(r => r.json()).then(json => {
      if (json.data) {
        setGroupId(json.data.group.id)
        setGroupName(json.data.group.name)
        setEditGroupName(json.data.group.name)
        setGroupSlug(json.data.group.slug)
        setIsAdmin(json.data.is_admin)
        setUserEmail(json.data.user_email ?? '')
        setUserRole(json.data.role ?? '')
        setSelectedPaletteId(json.data.group.palette_id ?? 'ocean')
      }
    }).catch(() => {})
  }, [])

  // ── Auto-clear toasts ────────────────────────────────────────────────────

  useEffect(() => { if (!prefsToast)     return; const t = setTimeout(() => setPrefsToast(null),     3000); return () => clearTimeout(t) }, [prefsToast])
  useEffect(() => { if (!paletteToast)   return; const t = setTimeout(() => setPaletteToast(null),   3000); return () => clearTimeout(t) }, [paletteToast])
  useEffect(() => { if (!groupNameToast) return; const t = setTimeout(() => setGroupNameToast(null), 3000); return () => clearTimeout(t) }, [groupNameToast])
  useEffect(() => { if (!newGroupToast)  return; const t = setTimeout(() => setNewGroupToast(null),  3000); return () => clearTimeout(t) }, [newGroupToast])
  useEffect(() => { if (!inviteToast)    return; const t = setTimeout(() => setInviteToast(null),    3000); return () => clearTimeout(t) }, [inviteToast])

  // ── Load members (lazy — only on first Members tab open) ─────────────────

  const loadMembers = useCallback(async () => {
    if (!groupId || membersLoaded) return
    setMembersLoading(true)
    try {
      const [mRes, iRes] = await Promise.all([
        fetch(`/api/groups/${groupId}/members`),
        fetch(`/api/groups/${groupId}/invites`),
      ])
      const mJson = await mRes.json()
      const iJson = await iRes.json()
      if (mJson.data) setMembers(mJson.data)
      if (iJson.data) setInvites(iJson.data)
      setMembersLoaded(true)
    } catch { /* silent */ } finally {
      setMembersLoading(false)
    }
  }, [groupId, membersLoaded])

  useEffect(() => {
    if (tab === 'Members' && !membersLoaded && groupId) {
      void loadMembers()
    }
  }, [tab, membersLoaded, groupId, loadMembers])

  // ── Handlers: Display ────────────────────────────────────────────────────

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

  // ── Handlers: Group ──────────────────────────────────────────────────────

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
      setGroupName(name)
      setGroupNameToast('Group name updated')
    } catch (err) {
      setGroupNameToast(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setGroupNameSaving(false)
    }
  }

  function handlePaletteSelect(id: string) {
    setSelectedPaletteId(id)
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

  async function handleCreateGroup() {
    const name = newGroupName.trim()
    if (name.length < 2) { setNewGroupToast('Name must be at least 2 characters'); return }
    setNewGroupSaving(true)
    try {
      const res  = await fetch('/api/groups', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create group')
      setNewGroupName('')
      setShowNewGroup(false)
      setNewGroupToast(`Group "${json.data.name}" created`)
    } catch (err) {
      setNewGroupToast(err instanceof Error ? err.message : 'Failed to create group')
    } finally {
      setNewGroupSaving(false)
    }
  }

  // ── Handlers: Members ────────────────────────────────────────────────────

  async function handleRoleChange(userId: string, newRole: string) {
    if (!groupId) return
    setRoleSaving(userId)
    try {
      const res  = await fetch(`/api/groups/${groupId}/members/${userId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to update role')
      setMembers(ms => ms.map(m => m.user_id === userId ? { ...m, role: newRole } : m))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setRoleSaving(null)
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!groupId) return
    try {
      const res  = await fetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to remove member')
      setMembers(ms => ms.filter(m => m.user_id !== userId))
      setDeleteConfirm(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member')
      setDeleteConfirm(null)
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!groupId) return
    try {
      const res  = await fetch(`/api/groups/${groupId}/invites/${inviteId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to cancel invite')
      setInvites(is => is.filter(i => i.id !== inviteId))
      setCancelConfirm(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel invite')
      setCancelConfirm(null)
    }
  }

  async function handleSendInvite() {
    if (!groupId) return
    const email = inviteEmail.trim().toLowerCase()
    if (!email.includes('@')) { setInviteToast('Enter a valid email address'); return }
    setInviteSaving(true)
    try {
      const res  = await fetch(`/api/groups/${groupId}/invites`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, role: inviteRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to send invite')
      // Add to local invite list (or update existing)
      setInvites(is => {
        const existing = is.findIndex(i => i.email === email)
        if (existing >= 0) {
          return is.map((i, idx) => idx === existing ? json.data : i)
        }
        return [...is, json.data]
      })
      setInviteEmail('')
      setInviteToast(`Invite recorded for ${email}`)
    } catch (err) {
      setInviteToast(err instanceof Error ? err.message : 'Failed to invite')
    } finally {
      setInviteSaving(false)
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const activePalette = getPalette(selectedPaletteId)

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6" /> Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Display preferences, group configuration and member management
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {(['Display', 'Group', 'Members'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'Display'  && <SlidersHorizontal className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            {t === 'Group'    && <Palette           className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            {t === 'Members'  && <Users             className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Display
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'Display' && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Display Preferences</CardTitle>
              <CardDescription>Controls how numbers are formatted across the dashboard</CardDescription>
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

          {/* Account info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
              <CardDescription>Your login details and group membership</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow label="Email"         value={userEmail || '—'} />
              <InfoRow label="Group"         value={groupName || '—'} />
              <InfoRow label="Slug"          value={groupSlug || '—'} />
              <InfoRow label="Your role"     value={userRole  || '—'} />
              <InfoRow
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
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Group
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'Group' && (
        <div className="space-y-5">

          {/* Group name */}
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
                <p className="text-sm font-medium">{groupName}</p>
              )}
            </CardContent>
          </Card>

          {/* Palette (admin only) */}
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
                        selectedPaletteId === palette.id
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
                      <p className="text-sm font-medium">{palette.name}</p>
                      {selectedPaletteId === palette.id && (
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

          {/* Create new group */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create a New Group</CardTitle>
              <CardDescription>
                Start a separate tenant for a different organisation. You will be assigned as super admin.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!showNewGroup ? (
                <Button variant="outline" size="sm" onClick={() => setShowNewGroup(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Create group
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      placeholder="Group name (e.g. Acme Holdings)"
                      className="flex-1"
                      onKeyDown={e => { if (e.key === 'Enter') void handleCreateGroup() }}
                    />
                    <Button size="sm" onClick={handleCreateGroup} disabled={newGroupSaving}>
                      {newGroupSaving ? 'Creating…' : 'Create'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setShowNewGroup(false); setNewGroupName('') }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {newGroupToast && (
                    <p className={cn(
                      'text-xs flex items-center gap-1',
                      newGroupToast.startsWith('Group "') ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                    )}>
                      {newGroupToast.startsWith('Group "') && <Check className="h-3.5 w-3.5" />}
                      {newGroupToast}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {!isAdmin && (
            <p className="text-sm text-muted-foreground">
              Group appearance settings can only be changed by group administrators.
            </p>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Members
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === 'Members' && (
        <div className="space-y-5">
          {!isAdmin ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Only group administrators can manage members.
              </CardContent>
            </Card>
          ) : membersLoading ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Loading members…
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Members list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Members
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {members.length === 0 ? (
                    <p className="px-6 py-4 text-sm text-muted-foreground">No members found.</p>
                  ) : (
                    <ul className="divide-y">
                      {members.map(member => (
                        <li key={member.user_id} className="flex items-center gap-3 px-6 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{member.email}</p>
                            <p className="text-xs text-muted-foreground">
                              Joined {new Date(member.joined_at).toLocaleDateString()}
                            </p>
                          </div>

                          {/* Role selector */}
                          <div className="relative">
                            <select
                              value={member.role}
                              disabled={roleSaving === member.user_id}
                              onChange={e => void handleRoleChange(member.user_id, e.target.value)}
                              className="appearance-none h-8 rounded-md border border-input bg-transparent pl-2 pr-7 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                            >
                              <option value="super_admin">Super Admin</option>
                              {ROLE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-1.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                          </div>

                          {/* Remove */}
                          {deleteConfirm === member.user_id ? (
                            <span className="flex items-center gap-1 text-xs">
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs px-2"
                                onClick={() => void handleRemoveMember(member.user_id)}
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs px-2"
                                onClick={() => setDeleteConfirm(null)}
                              >
                                Cancel
                              </Button>
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteConfirm(member.user_id)}
                            >
                              Remove
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Pending invites */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pending Invites</CardTitle>
                  <CardDescription>
                    Invites are recorded here. Share the app URL and ask users to sign in — their role will apply automatically upon account creation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {invites.length === 0 ? (
                    <p className="px-6 py-4 text-sm text-muted-foreground">No pending invites.</p>
                  ) : (
                    <ul className="divide-y">
                      {invites.map(invite => (
                        <li key={invite.id} className="flex items-center gap-3 px-6 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{invite.email}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {invite.role.replace(/_/g, ' ')} · Invited {new Date(invite.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          {cancelConfirm === invite.id ? (
                            <span className="flex items-center gap-1 text-xs">
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs px-2"
                                onClick={() => void handleCancelInvite(invite.id)}
                              >
                                Cancel invite
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs px-2"
                                onClick={() => setCancelConfirm(null)}
                              >
                                Keep
                              </Button>
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
                              onClick={() => setCancelConfirm(invite.id)}
                            >
                              Revoke
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Invite form */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Invite a Member</CardTitle>
                  <CardDescription>Record an email address and role to give access when they sign up.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="flex-1"
                      onKeyDown={e => { if (e.key === 'Enter') void handleSendInvite() }}
                    />
                    <div className="relative">
                      <select
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value)}
                        className="appearance-none h-9 rounded-md border border-input bg-transparent pl-2 pr-7 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {INVITE_ROLE_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-1.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <Button size="sm" onClick={handleSendInvite} disabled={inviteSaving}>
                      {inviteSaving ? 'Saving…' : 'Invite'}
                    </Button>
                  </div>
                  {inviteToast && (
                    <p className={cn(
                      'text-xs flex items-center gap-1',
                      inviteToast.startsWith('Invite recorded') ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                    )}>
                      {inviteToast.startsWith('Invite recorded') && <Check className="h-3.5 w-3.5" />}
                      {inviteToast}
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
