'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface AdminRun {
  id:          string
  status:      string
  created_at:  string
  duration_s:  number | null
  tokens_used: number | null
  agent_id:    string
  agent_name:  string
  group_id:    string
  group_name:  string
}

const STATUS_BADGE: Record<string, string> = {
  queued:    'bg-zinc-700 text-zinc-300',
  running:   'bg-blue-900 text-blue-300',
  success:   'bg-green-900 text-green-300',
  error:     'bg-red-900 text-red-300',
  cancelled: 'bg-amber-900 text-amber-300',
}

const STATUS_OPTIONS = ['all', 'queued', 'running', 'success', 'error', 'cancelled']

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function AdminAgentRunsPage() {
  const [runs,    setRuns]    = useState<AdminRun[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [status,  setStatus]  = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (status !== 'all') params.set('status', status)

    fetch(`/api/admin/agent-runs?${params}`)
      .then(r => r.json())
      .then(json => {
        setRuns(json.data ?? [])
        setTotal(json.total ?? 0)
      })
      .finally(() => setLoading(false))
  }, [page, status])

  function handleStatusChange(next: string) {
    setStatus(next)
    setPage(1)
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Agent Runs</h1>
          <p className="text-zinc-400 text-sm mt-1">All agent runs across all groups. {total > 0 && `${total.toLocaleString()} total.`}</p>
        </div>
        <select
          value={status}
          onChange={e => handleStatusChange(e.target.value)}
          className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>
          ))}
        </select>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Agent</th>
              <th className="px-5 py-3 text-left">Group</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-right">Duration</th>
              <th className="px-4 py-3 text-right">Tokens</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-zinc-500">Loading…</td></tr>
            )}
            {!loading && runs.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-zinc-500">No runs found.</td></tr>
            )}
            {runs.map(run => (
              <tr key={run.id} className="hover:bg-zinc-800/40 transition-colors">
                <td className="px-5 py-3 text-white">{run.agent_name}</td>
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/groups/${run.group_id}`}
                    className="text-zinc-300 hover:text-white hover:underline"
                  >
                    {run.group_name}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[run.status] ?? STATUS_BADGE.queued}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-zinc-400">{fmtDate(run.created_at)}</td>
                <td className="px-4 py-3 text-right text-zinc-400 tabular-nums">
                  {run.duration_s !== null ? `${run.duration_s}s` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-zinc-400 tabular-nums">
                  {run.tokens_used !== null ? run.tokens_used.toLocaleString() : '—'}
                </td>
                <td className="px-5 py-3 text-right">
                  <Link
                    href={`/admin/agent-runs/${run.id}`}
                    className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1 rounded transition-colors"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-zinc-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
