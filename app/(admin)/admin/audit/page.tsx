'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface AuditEntry {
  id:           string
  actor_id:     string | null
  actor_email:  string | null
  action:       string
  entity_type:  string
  entity_id:    string | null
  metadata:     Record<string, unknown> | null
  created_at:   string
}

interface Pagination {
  page:  number
  limit: number
  total: number
  pages: number
}

const ACTION_LABELS: Record<string, string> = {
  create_group:    'Created group',
  update_group:    'Updated group',
  deactivate_group: 'Deactivated group',
  create_user:     'Created user',
  update_user:     'Updated user',
  deactivate_user: 'Deactivated user',
  update_agent:    'Updated agent',
  disable_agent:   'Disabled agent',
  deactivate_agent: 'Deactivated agent',
}

const ACTION_COLOUR: Record<string, string> = {
  create_group:    'bg-green-900/50 text-green-300',
  update_group:    'bg-blue-900/50 text-blue-300',
  deactivate_group: 'bg-red-900/50 text-red-300',
  create_user:     'bg-green-900/50 text-green-300',
  update_user:     'bg-blue-900/50 text-blue-300',
  deactivate_user: 'bg-red-900/50 text-red-300',
  update_agent:    'bg-blue-900/50 text-blue-300',
  disable_agent:   'bg-red-900/50 text-red-300',
  deactivate_agent: 'bg-red-900/50 text-red-300',
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function AdminAuditPage() {
  const [entries, setEntries]   = useState<AuditEntry[]>([])
  const [paging,  setPaging]    = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 1 })
  const [page,    setPage]      = useState(1)
  const [loading, setLoading]   = useState(true)
  const [action,  setAction]    = useState('')
  const [entity,  setEntity]    = useState('')

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (action) params.set('action', action)
    if (entity) params.set('entity_type', entity)

    fetch(`/api/admin/audit?${params}`)
      .then(r => r.json())
      .then(json => {
        setEntries((json.data ?? []) as AuditEntry[])
        if (json.pagination) setPaging(json.pagination as Pagination)
      })
      .finally(() => setLoading(false))
  }, [page, action, entity])

  function handleFilterChange(newAction: string, newEntity: string) {
    setPage(1)
    setAction(newAction)
    setEntity(newEntity)
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-zinc-400 text-sm mt-1">All admin actions across the platform.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={entity}
            onChange={e => handleFilterChange(action, e.target.value)}
            className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">All entities</option>
            <option value="group">Groups</option>
            <option value="user">Users</option>
            <option value="agent">Agents</option>
          </select>
          <select
            value={action}
            onChange={e => handleFilterChange(e.target.value, entity)}
            className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="">All actions</option>
            {Object.keys(ACTION_LABELS).map(k => (
              <option key={k} value={k}>{ACTION_LABELS[k]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Timestamp</th>
              <th className="px-5 py-3 text-left">Actor</th>
              <th className="px-5 py-3 text-left">Action</th>
              <th className="px-5 py-3 text-left">Entity</th>
              <th className="px-5 py-3 text-left">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-zinc-500">Loading…</td></tr>
            )}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-zinc-500">No audit entries found.</td></tr>
            )}
            {entries.map(e => (
              <tr key={e.id} className="hover:bg-zinc-800/30 transition-colors">
                <td className="px-5 py-3 text-zinc-400 text-xs whitespace-nowrap">{fmtDate(e.created_at)}</td>
                <td className="px-5 py-3 text-zinc-300 text-xs truncate max-w-[180px]">
                  {e.actor_email ?? e.actor_id ?? '—'}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${ACTION_COLOUR[e.action] ?? 'bg-zinc-700 text-zinc-300'}`}>
                    {ACTION_LABELS[e.action] ?? e.action}
                  </span>
                </td>
                <td className="px-5 py-3 text-zinc-400 text-xs">
                  <span className="capitalize">{e.entity_type}</span>
                  {e.entity_id && (
                    <span className="block font-mono text-[10px] text-zinc-600 mt-0.5 truncate max-w-[140px]">
                      {e.entity_id}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-zinc-500 text-xs font-mono truncate max-w-[240px]">
                  {e.metadata ? JSON.stringify(e.metadata) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {paging.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-xs text-zinc-500">
            Page {paging.page} of {paging.pages} · {paging.total.toLocaleString()} entries
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(paging.pages, p + 1))}
              disabled={page >= paging.pages}
              className="p-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
