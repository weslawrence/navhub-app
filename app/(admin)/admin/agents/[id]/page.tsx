'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react'

interface AgentDetail {
  id:           string
  name:         string
  model:        string
  persona:      string | null
  instructions: string | null
  tools:        string[]
  is_active:    boolean
  group_id:     string
  created_at:   string
}

interface RunRow {
  id:           string
  status:       string
  created_at:   string
  started_at:   string | null
  completed_at: string | null
  tokens_used:  number | null
}

interface GroupInfo {
  id:   string
  name: string
}

const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-4-6':         'Claude Sonnet 4.6',
  'claude-opus-4-6':           'Claude Opus 4.6',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'gpt-4o':                    'GPT-4o',
}

const STATUS_BADGE: Record<string, string> = {
  queued:    'bg-zinc-700 text-zinc-300',
  running:   'bg-blue-900 text-blue-300',
  success:   'bg-green-900 text-green-300',
  error:     'bg-red-900 text-red-300',
  cancelled: 'bg-amber-900 text-amber-300',
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function AdminAgentDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()

  const [agent,   setAgent]   = useState<AgentDetail | null>(null)
  const [group,   setGroup]   = useState<GroupInfo | null>(null)
  const [runs,    setRuns]    = useState<RunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [confirm, setConfirm] = useState<'deactivate' | 'activate' | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    // Fetch agent info + recent runs in parallel
    Promise.all([
      fetch(`/api/admin/agents/${id}`).then(r => r.json()),
      fetch(`/api/admin/agent-runs?agent_id=${id}&limit=20`).then(r => r.json()),
    ]).then(([agentJson, runsJson]) => {
      if (agentJson.data) {
        setAgent(agentJson.data.agent as AgentDetail)
        setGroup(agentJson.data.group as GroupInfo)
      }
      if (runsJson.data) {
        setRuns(runsJson.data as RunRow[])
      }
    }).finally(() => setLoading(false))
  }, [id])

  async function toggleActive() {
    if (!agent) return
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/admin/agents/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_active: !agent.is_active }),
    })
    const json = await res.json()
    if (res.ok) {
      setAgent(prev => prev ? { ...prev, is_active: !prev.is_active } : prev)
      setConfirm(null)
    } else {
      setError(json.error ?? 'Failed to update agent.')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="p-6 text-zinc-500">Loading…</div>
    )
  }

  if (!agent) {
    return (
      <div className="p-6">
        <p className="text-zinc-400">Agent not found.</p>
        <Link href="/admin/agents" className="text-amber-400 text-sm mt-2 inline-block">← Back to agents</Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/admin/agents" className="mt-1 text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${agent.is_active ? 'bg-green-900/50 text-green-300' : 'bg-zinc-700 text-zinc-400'}`}>
                {agent.is_active ? 'Active' : 'Disabled'}
              </span>
            </div>
            {group && (
              <Link href={`/admin/groups/${group.id}`} className="text-zinc-400 hover:text-amber-400 text-sm mt-0.5 inline-block transition-colors">
                {group.name}
              </Link>
            )}
          </div>
        </div>

        {/* Deactivate / Activate */}
        <div className="flex items-center gap-2">
          {confirm ? (
            <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
              <p className="text-xs text-zinc-300">
                {confirm === 'deactivate' ? 'Disable this agent?' : 'Enable this agent?'}
              </p>
              <button
                onClick={toggleActive}
                disabled={saving}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${confirm === 'deactivate' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
              <button onClick={() => setConfirm(null)} className="text-xs text-zinc-500 hover:text-white">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirm(agent.is_active ? 'deactivate' : 'activate')}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                agent.is_active
                  ? 'border-zinc-700 text-zinc-400 hover:border-red-500 hover:text-red-400'
                  : 'border-zinc-700 text-zinc-400 hover:border-green-500 hover:text-green-400'
              }`}
            >
              {agent.is_active ? 'Disable Agent' : 'Enable Agent'}
            </button>
          )}
          <Link
            href={`/agents/${id}/edit`}
            className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded transition-colors"
          >
            Edit Agent
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ['Model',   MODEL_LABELS[agent.model] ?? agent.model],
          ['Tools',   agent.tools?.length ?? 0],
          ['Created', fmtDate(agent.created_at)],
          ['ID',      agent.id],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
            <p className="text-sm text-white mt-1 font-mono truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Tools */}
      {(agent.tools ?? []).length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Tools</h3>
          <div className="flex flex-wrap gap-2">
            {(agent.tools ?? []).map(t => (
              <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Persona */}
      {agent.persona && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-2">Persona</h3>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{agent.persona}</p>
        </div>
      )}

      {/* Instructions */}
      {agent.instructions && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-2">Instructions</h3>
          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{agent.instructions}</p>
        </div>
      )}

      {/* Run history */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Recent Runs</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
              <th className="px-5 py-2.5 text-left">Date</th>
              <th className="px-4 py-2.5 text-center">Status</th>
              <th className="px-4 py-2.5 text-right">Duration</th>
              <th className="px-4 py-2.5 text-right">Tokens</th>
              <th className="px-5 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {runs.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-4 text-zinc-500 text-center">No runs yet.</td></tr>
            )}
            {runs.map(r => {
              const dur = r.started_at && r.completed_at
                ? `${Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)}s`
                : null
              return (
                <tr key={r.id} className="hover:bg-zinc-800/30">
                  <td className="px-5 py-2.5 text-zinc-300">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] ?? STATUS_BADGE.queued}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-400">{dur ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-400">
                    {r.tokens_used ? r.tokens_used.toLocaleString() : '—'}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <Link
                      href={`/admin/agent-runs/${r.id}`}
                      className="text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
