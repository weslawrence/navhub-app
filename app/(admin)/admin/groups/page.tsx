'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import ImpersonateButton from '@/components/admin/ImpersonateButton'

interface AdminGroup {
  id:          string
  name:        string
  slug:        string | null
  palette_id:  string | null
  created_at:  string
  company_count: number
  user_count:    number
  last_run_at:   string | null
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdminGroupsPage() {
  const [groups,  setGroups]  = useState<AdminGroup[]>([])
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/groups')
      .then(r => r.json())
      .then(json => { setGroups((json.data ?? []) as AdminGroup[]) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return groups
    const q = search.toLowerCase()
    return groups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      (g.slug ?? '').toLowerCase().includes(q)
    )
  }, [groups, search])

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Groups</h1>
          <p className="text-zinc-400 text-sm mt-1">All tenant groups on the platform.</p>
        </div>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search groups…"
          className="w-60 h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Name</th>
              <th className="px-5 py-3 text-left">Slug</th>
              <th className="px-5 py-3 text-left">Palette</th>
              <th className="px-4 py-3 text-right">Cos</th>
              <th className="px-4 py-3 text-right">Users</th>
              <th className="px-5 py-3 text-left">Created</th>
              <th className="px-5 py-3 text-left">Last Run</th>
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
              <tr key={g.id} className="hover:bg-zinc-800/40 transition-colors">
                <td className="px-5 py-3 font-medium text-white">{g.name}</td>
                <td className="px-5 py-3 text-zinc-400 font-mono text-xs">{g.slug ?? '—'}</td>
                <td className="px-5 py-3 text-zinc-400 capitalize">{g.palette_id ?? '—'}</td>
                <td className="px-4 py-3 text-right text-zinc-300">{g.company_count}</td>
                <td className="px-4 py-3 text-right text-zinc-300">{g.user_count}</td>
                <td className="px-5 py-3 text-zinc-400">{fmtDate(g.created_at)}</td>
                <td className="px-5 py-3 text-zinc-400">{fmtDate(g.last_run_at)}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <Link
                      href={`/admin/groups/${g.id}`}
                      className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1 rounded transition-colors"
                    >
                      View
                    </Link>
                    <ImpersonateButton groupId={g.id} groupName={g.name} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
