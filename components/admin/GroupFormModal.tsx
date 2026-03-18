'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface GroupFormModalProps {
  /** If set, editing an existing group; otherwise creating */
  group?: {
    id: string
    name: string
    subscription_tier: string
    token_limit_mtd: number
    owner_id: string | null
    is_active: boolean
  }
  onClose: () => void
  onSaved: () => void
}

const TIER_LIMITS: Record<string, number> = {
  starter:    1_000_000,
  pro:        5_000_000,
  enterprise: 20_000_000,
}

const TIER_OPTIONS = [
  { value: 'starter',    label: 'Starter' },
  { value: 'pro',        label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
]

export default function GroupFormModal({ group, onClose, onSaved }: GroupFormModalProps) {
  const isEdit = !!group

  const [name,       setName]       = useState(group?.name ?? '')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [tier,       setTier]       = useState(group?.subscription_tier ?? 'starter')
  const [tokenLimit, setTokenLimit] = useState(group?.token_limit_mtd ?? TIER_LIMITS.starter)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Auto-fill token limit when tier changes (only if not manually overridden)
  function handleTierChange(newTier: string) {
    setTier(newTier)
    setTokenLimit(TIER_LIMITS[newTier] ?? TIER_LIMITS.starter)
  }

  useEffect(() => {
    if (!isEdit) {
      setTokenLimit(TIER_LIMITS[tier] ?? TIER_LIMITS.starter)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return }
    if (!isEdit && !ownerEmail.trim()) { setError('Owner email is required for new groups.'); return }

    setSaving(true)
    setError(null)

    try {
      const url    = isEdit ? `/api/admin/groups/${group!.id}` : '/api/admin/groups'
      const method = isEdit ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = {
        name:              name.trim(),
        subscription_tier: tier,
        token_limit_mtd:   tokenLimit,
      }
      if (!isEdit) body.owner_email = ownerEmail.trim()

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setError(json.error ?? 'Failed to save.'); return }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Group' : 'New Group'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Group Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Acme Corp"
              className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Owner email — new groups only */}
          {!isEdit && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Owner Email *</label>
              <input
                type="email"
                value={ownerEmail}
                onChange={e => setOwnerEmail(e.target.value)}
                placeholder="owner@company.com"
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <p className="text-xs text-zinc-500 mt-1">User will be created if they don&apos;t exist.</p>
            </div>
          )}

          {/* Subscription tier */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Subscription Tier</label>
            <select
              value={tier}
              onChange={e => handleTierChange(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {TIER_OPTIONS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Token limit */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Monthly Token Limit</label>
            <input
              type="number"
              value={tokenLimit}
              onChange={e => setTokenLimit(parseInt(e.target.value) || 0)}
              min={0}
              step={100000}
              className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <p className="text-xs text-zinc-500 mt-1">
              {(tokenLimit / 1_000_000).toFixed(1)}M tokens / month
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-400 text-black rounded-lg transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Group')}
          </button>
        </div>
      </div>
    </div>
  )
}
