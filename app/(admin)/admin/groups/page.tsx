'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import ImpersonateButton from '@/components/admin/ImpersonateButton'
import GroupFormModal from '@/components/admin/GroupFormModal'

interface AdminGroup {
  id:                string
  name:              string
  slug:              string | null
  palette_id:        string | null
  created_at:        string
  company_count:     number
  user_count:        number
  last_run_at:       string | null
  subscription_tier: string
  token_usage_mtd:   number
  token_limit_mtd:   number
  owner_id:          string | null
  is_active:         boolean
}

const TIER_BADGE: Record<string, string> = {
  starter:    'bg-zinc-700 text-zinc-300',
  pro:        'bg-blue-900/60 text-blue-300',
  enterprise: 'bg-amber-900/60 text-amber-300',
}

function TokenBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const colour = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-mono shrink-0 ${pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-zinc-500'}`}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdminGroupsPage() {
  const [groups,    setGroups]    = useState<AdminGroup[]>([])
  const [search,    setSearch]    = useState('')
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editGroup, setEditGroup] = useState<AdminGroup | null>(null)
  const [confirm,   setConfirm]   = useState<{ id: string; name: string; active: boolean } | null>(null)

  function loadGroups() {
    setLoading(true)
    fetch('/api/admin/groups')
      .then(r => r.json())
      .then(json => setGroups((json.data ?? []) as AdminGroup[]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadGroups() }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return groups
    const q = search.toLowerCase()
    return groups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      (g.slug ?? '').toLowerCase().includes(q)
    )
  }, [groups, search])

  async function toggleActive(g: AdminGroup) {
    await fetch(`/api/admin/groups/${g.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_active: !g.is_active }),
    })
    setGroups(prev => prev.map(x => x.id === g.id ? { ...x, is_active: !x.is_active } : x))
    setConfirm(null)
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Groups</h1>
          <p className="text-zinc-400 text-sm mt-1">All tenant groups on the platform.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search groups…"
            className="w-56 h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            onClick={() => { setEditGroup(null); setShowModal(true) }}
            className="h-9 px-3 rounded-md bg-amber-500 hover:bg-amber-600 text-black text-sm font-semibold transition-colors whitespace-nowrap"
          >
            + New Group
          </button>
        </div>
      </div>

      {/* Inline confirm */}
      {confirm && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-white">
            {confirm.active ? 'Deactivate' : 'Reactivate'} group <strong>{confirm.name}</strong>?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleActive(groups.find(g => g.id === confirm.id)!)}
              className="text-xs px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              Confirm
            </button>
            <button onClick={() => setConfirm(null)} className="text-xs text-zinc-400 hover:text-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Name</th>
              <th className="px-5 py-3 text-left">Tier</th>
              <th className="px-5 py-3 text-left">Token Usage MTD</th>
              <th className="px-4 py-3 text-right">Cos</th>
              <th className="px-4 py-3 text-right">Users</th>
              <th className="px-5 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-zinc-500">Loading…</td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-zinc-500">No groups found.</td>
              </tr>
            )}
            {filtered.map(g => (
              <tr key={g.id} className={`hover:bg-zinc-800/40 transition-colors ${!g.is_active ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3">
                  <p className="font-medium text-white">{g.name}</p>
                  {g.slug && <p className="text-[11px] text-zinc-500 font-mono">{g.slug}</p>}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${TIER_BADGE[g.subscription_tier] ?? TIER_BADGE.starter}`}>
                    {g.subscription_tier}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <TokenBar used={g.token_usage_mtd} limit={g.token_limit_mtd} />
                  <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">
                    {(g.token_usage_mtd / 1000).toFixed(0)}k / {(g.token_limit_mtd / 1000000).toFixed(1)}M
                  </p>
                </td>
                <td className="px-4 py-3 text-right text-zinc-300">{g.company_count}</td>
                <td className="px-4 py-3 text-right text-zinc-300">{g.user_count}</td>
                <td className="px-5 py-3 text-zinc-400">{fmtDate(g.created_at)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${g.is_active ? 'bg-green-900/50 text-green-300' : 'bg-zinc-700 text-zinc-400'}`}>
                    {g.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1.5 justify-end flex-wrap">
                    <Link
                      href={`/admin/groups/${g.id}`}
                      className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2 py-1 rounded transition-colors"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => { setEditGroup(g); setShowModal(true) }}
                      className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2 py-1 rounded transition-colors"
                    >
                      Edit
                    </button>
                    <ImpersonateButton groupId={g.id} groupName={g.name} />
                    <button
                      onClick={() => setConfirm({ id: g.id, name: g.name, active: g.is_active })}
                      className={`text-xs border px-2 py-1 rounded transition-colors ${
                        g.is_active
                          ? 'text-red-400 border-red-900/50 hover:border-red-500'
                          : 'text-green-400 border-green-900/50 hover:border-green-500'
                      }`}
                    >
                      {g.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && (
        <p className="text-xs text-zinc-600">{filtered.length} of {groups.length} groups</p>
      )}

      {showModal && (
        <GroupFormModal
          group={editGroup ?? undefined}
          onClose={() => { setShowModal(false); setEditGroup(null) }}
          onSaved={() => { setShowModal(false); setEditGroup(null); loadGroups() }}
        />
      )}
    </div>
  )
}
