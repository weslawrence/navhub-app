'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface Group {
  id:   string
  name: string
}

interface UserFormModalProps {
  /** If set, editing role for an existing user in a group */
  user?: {
    id:       string
    email:    string
    group_id: string
    role:     string
  }
  onClose: () => void
  onSaved: () => void
}

const ROLES = [
  { value: 'group_admin',      label: 'Group Admin' },
  { value: 'company_viewer',   label: 'Company Viewer' },
  { value: 'division_viewer',  label: 'Division Viewer' },
]

export default function UserFormModal({ user, onClose, onSaved }: UserFormModalProps) {
  const isEdit = !!user

  const [email,    setEmail]    = useState(user?.email ?? '')
  const [password, setPassword] = useState('')
  const [groupId,  setGroupId]  = useState(user?.group_id ?? '')
  const [role,     setRole]     = useState(user?.role ?? 'company_viewer')
  const [groups,   setGroups]   = useState<Group[]>([])
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/groups')
      .then(r => r.json())
      .then(json => {
        const list = (json.data ?? []) as { id: string; name: string }[]
        setGroups(list)
        if (!groupId && list.length > 0) setGroupId(list[0].id)
      })
      .catch(() => {})
  }, [groupId])

  async function handleSave() {
    if (!isEdit && !email.trim()) { setError('Email is required.'); return }
    if (!isEdit && !password.trim()) { setError('Password is required for new users.'); return }
    if (!groupId) { setError('Please select a group.'); return }

    setSaving(true)
    setError(null)

    try {
      if (isEdit) {
        const res = await fetch(`/api/admin/users/${user!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, group_id: groupId }),
        })
        const json = await res.json() as { error?: string }
        if (!res.ok) { setError(json.error ?? 'Failed to save.'); return }
      } else {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password, group_id: groupId, role }),
        })
        const json = await res.json() as { error?: string }
        if (!res.ok) { setError(json.error ?? 'Failed to save.'); return }
      }
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
          <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit User' : 'New User'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Email — new users only */}
          {!isEdit && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email *</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@company.com"
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Password — new users only */}
          {!isEdit && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Temporary Password *</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Read-only email in edit mode */}
          {isEdit && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email</label>
              <p className="text-sm text-white">{user!.email}</p>
            </div>
          )}

          {/* Group */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Group *</label>
            <select
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
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
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create User')}
          </button>
        </div>
      </div>
    </div>
  )
}
