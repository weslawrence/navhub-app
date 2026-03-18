'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'

interface AdminAgent {
  id:          string
  name:        string
  model:       string
  tools_count: number
  group_id:    string
  group_name:  string
  is_active:   boolean
  run_count:   number
  total_tokens: number
  last_run_at: string | null
}

const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-4-6':            'Claude Sonnet 4.6',
  'claude-opus-4-6':              'Claude Opus 4.6',
  'claude-haiku-4-5-20251001':    'Claude Haiku 4.5',
  'gpt-4o':                       'GPT-4o',
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AdminAgentsPage() {
  const [agents,  setAgents]  = useState<AdminAgent[]>([])
  const [search,  setSearch]  = useState('')
  const [status,  setStatus]  = useState<'all' | 'active' | 'inactive'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/agents')
      .then(r => r.json())
      .then(json => setAgents((json.data ?? []) as AdminAgent[]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let list = agents
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.group_name.toLowerCase().includes(q)
      )
    }
    if (status === 'active')   list = list.filter(a => a.is_active)
    if (status === 'inactive') list = list.filter(a => !a.is_active)
    return list
  }, [agents, search, status])

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-zinc-400 text-sm mt-1">All AI agents across all groups.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={e => setStatus(e.target.value as typeof status)}
            className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents or groups…"
            className="w-60 h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
              <th className="px-5 py-3 text-left">Agent</th>
              <th className="px-5 py-3 text-left">Group</th>
              <th className="px-5 py-3 text-left">Model</th>
              <th className="px-4 py-3 text-right">Tools</th>
              <th className="px-4 py-3 text-right">Runs</th>
              <th className="px-4 py-3 text-right">Tokens</th>
              <th className="px-5 py-3 text-left">Last Run</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-zinc-500">Loading…</td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-zinc-500">No agents found.</td>
              </tr>
            )}
            {filtered.map(a => (
              <tr key={a.id} className={`hover:bg-zinc-800/40 transition-colors ${!a.is_active ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3 font-medium text-white">{a.name}</td>
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/groups/${a.group_id}`}
                    className="text-zinc-400 hover:text-amber-400 transition-colors text-xs"
                  >
                    {a.group_name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-zinc-400 text-xs">{MODEL_LABELS[a.model] ?? a.model}</td>
                <td className="px-4 py-3 text-right text-zinc-300">{a.tools_count}</td>
                <td className="px-4 py-3 text-right text-zinc-300">{a.run_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-zinc-300">
                  {a.total_tokens > 0 ? (a.total_tokens / 1000).toFixed(1) + 'k' : '—'}
                </td>
                <td className="px-5 py-3 text-zinc-400">{fmtDate(a.last_run_at)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                    a.is_active
                      ? 'bg-green-900/50 text-green-300'
                      : 'bg-zinc-700 text-zinc-400'
                  }`}>
                    {a.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <Link
                      href={`/admin/agents/${a.id}`}
                      className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2.5 py-1 rounded transition-colors"
                    >
                      View
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && (
        <p className="text-xs text-zinc-600">{filtered.length} of {agents.length} agents</p>
      )}
    </div>
  )
}
