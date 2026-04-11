'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn }     from '@/lib/utils'
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  type AppRole,
  type FeatureKey,
  type AccessLevel,
  type PermissionMatrix,
} from '@/lib/types'

interface PermissionsModalProps {
  userId:    string
  groupId:   string
  email:     string
  role:      AppRole
  companies: { id: string; name: string }[]
  onSave:    () => void
  onClose:   () => void
}

const ACCESS_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
]

function accessColor(a: AccessLevel): string {
  if (a === 'edit') return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700'
  if (a === 'view') return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
  return 'bg-muted text-muted-foreground border-border'
}

// Features shown in the grid (exclude settings — handled separately)
const GRID_FEATURES = FEATURE_KEYS.filter(f => f !== 'settings')

export default function PermissionsModal({
  userId,
  groupId,
  email,
  role,
  companies,
  onSave,
  onClose,
}: PermissionsModalProps) {
  const [matrix, setMatrix]     = useState<PermissionMatrix>({} as PermissionMatrix)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Load existing permissions
  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch(`/api/groups/${groupId}/members/${userId}/permissions`)
        const json = await res.json() as { data?: { matrix: PermissionMatrix } }
        if (json.data?.matrix) {
          setMatrix(json.data.matrix)
          // Check if settings has any access
          const settingsPerms = json.data.matrix.settings ?? {}
          setShowSettings(Object.values(settingsPerms).some(a => a !== 'none'))
        }
      } catch { /* ignore */ }
      setLoading(false)
    }
    void load()
  }, [groupId, userId])

  function setCell(feature: FeatureKey, companyKey: string, value: AccessLevel) {
    setMatrix(prev => ({
      ...prev,
      [feature]: { ...prev[feature], [companyKey]: value },
    }))
  }

  function setRow(feature: FeatureKey, value: AccessLevel) {
    const newFeature: Record<string, AccessLevel> = { default: value }
    companies.forEach(c => { newFeature[c.id] = value })
    setMatrix(prev => ({ ...prev, [feature]: newFeature }))
  }

  function setColumn(companyKey: string, value: AccessLevel) {
    setMatrix(prev => {
      const next = { ...prev }
      const features = showSettings ? [...GRID_FEATURES, 'settings' as FeatureKey] : GRID_FEATURES
      features.forEach(f => {
        next[f] = { ...next[f], [companyKey]: value }
      })
      return next
    })
  }

  function setAll(value: AccessLevel) {
    const next = {} as PermissionMatrix
    const features = showSettings ? [...GRID_FEATURES, 'settings' as FeatureKey] : GRID_FEATURES
    features.forEach(f => {
      next[f] = { default: value }
      companies.forEach(c => { next[f][c.id] = value })
    })
    // Preserve settings if not showing
    if (!showSettings) next.settings = { default: 'none' }
    setMatrix(next)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const permissions: Array<{ feature: FeatureKey; company_id: string | null; access: AccessLevel }> = []
      for (const feature of FEATURE_KEYS) {
        const perms = matrix[feature] ?? {}
        for (const [key, access] of Object.entries(perms)) {
          permissions.push({
            feature,
            company_id: key === 'default' ? null : key,
            access,
          })
        }
      }

      await fetch(`/api/groups/${groupId}/members/${userId}/permissions`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ permissions }),
      })

      setSaved(true)
      setTimeout(() => { onSave(); onClose() }, 500)
    } finally {
      setSaving(false)
    }
  }

  const visibleFeatures = showSettings ? [...GRID_FEATURES, 'settings' as FeatureKey] : GRID_FEATURES

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl shadow-2xl border w-[90vw] max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-semibold">Manage Access</h2>
            <p className="text-sm text-muted-foreground">{email} &middot; {role}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
            {/* Top controls */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showSettings}
                  onChange={e => {
                    setShowSettings(e.target.checked)
                    if (!e.target.checked) {
                      setMatrix(prev => ({ ...prev, settings: { default: 'none' } }))
                    }
                  }}
                  className="rounded border-input"
                />
                Grant settings access
              </label>
            </div>

            {/* Permissions grid */}
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[140px]">Feature</th>
                    <th className="text-center px-2 py-2 font-medium text-muted-foreground min-w-[100px]">
                      All companies
                    </th>
                    {companies.map(c => (
                      <th key={c.id} className="text-center px-2 py-2 font-medium text-muted-foreground min-w-[100px] truncate max-w-[120px]">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                  {/* Column setter row */}
                  <tr className="border-t bg-muted/20">
                    <td className="px-3 py-1.5 text-xs text-muted-foreground italic">All features</td>
                    <td className="px-2 py-1.5 text-center">
                      <select
                        value=""
                        onChange={e => { if (e.target.value) setAll(e.target.value as AccessLevel) }}
                        className={cn('h-7 rounded border text-xs px-1 w-20', 'bg-background text-foreground border-border')}
                      >
                        <option value="">Set all…</option>
                        {ACCESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    {companies.map(c => (
                      <td key={c.id} className="px-2 py-1.5 text-center">
                        <select
                          value=""
                          onChange={e => { if (e.target.value) setColumn(c.id, e.target.value as AccessLevel) }}
                          className={cn('h-7 rounded border text-xs px-1 w-20', 'bg-background text-foreground border-border')}
                        >
                          <option value="">Set…</option>
                          {ACCESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleFeatures.map(feature => {
                    const featurePerms = matrix[feature] ?? {}
                    return (
                      <tr key={feature} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium text-foreground">{FEATURE_LABELS[feature]}</td>
                        {/* Row default setter */}
                        <td className="px-2 py-2 text-center">
                          <select
                            value={featurePerms['default'] ?? 'none'}
                            onChange={e => setRow(feature, e.target.value as AccessLevel)}
                            className={cn(
                              'h-7 rounded border text-xs px-1 w-20',
                              accessColor(featurePerms['default'] ?? 'none'),
                            )}
                          >
                            {ACCESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        {/* Per-company cells */}
                        {companies.map(c => (
                          <td key={c.id} className="px-2 py-2 text-center">
                            <select
                              value={featurePerms[c.id] ?? featurePerms['default'] ?? 'none'}
                              onChange={e => setCell(feature, c.id, e.target.value as AccessLevel)}
                              className={cn(
                                'h-7 rounded border text-xs px-1 w-20',
                                accessColor(featurePerms[c.id] ?? featurePerms['default'] ?? 'none'),
                              )}
                            >
                              {ACCESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-green-200 dark:bg-green-800 border border-green-400" />
                Edit
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-blue-200 dark:bg-blue-800 border border-blue-400" />
                View
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-muted border border-border" />
                No access
              </span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving || loading} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
            {saved ? 'Saved' : 'Save Permissions'}
          </Button>
        </div>
      </div>
    </div>
  )
}
