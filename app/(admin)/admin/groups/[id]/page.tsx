'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react'
import ImpersonateButton from '@/components/admin/ImpersonateButton'
import GroupFormModal from '@/components/admin/GroupFormModal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroupDetail {
  id: string; name: string; slug: string | null; palette_id: string | null; created_at: string
  subscription_tier: string; token_usage_mtd: number; token_limit_mtd: number
  is_active: boolean; owner_id: string | null
}
interface CompanyRow {
  id: string; name: string; is_active: boolean
  division_count: number; has_xero: boolean; last_synced_at: string | null
}
interface MemberRow {
  user_id: string; email: string; role: string; is_default: boolean
  joined_at: string; last_sign_in_at: string | null
}
interface RunRow {
  id: string; status: string; created_at: string; agent_name: string | null
  tokens_used: number | null; completed_at: string | null; started_at: string | null
}
interface ReportRow { id: string; name: string; created_at: string }
interface DocRow    { id: string; title: string; document_type: string; created_at: string }
interface SnapshotRow { id: string; name: string; created_at: string; company_id: string }

interface GroupDetailData {
  group:        GroupDetail
  companies:    CompanyRow[]
  storage_files: { bucket: string; count: number }[]
}

const STATUS_BADGE: Record<string, string> = {
  queued:    'bg-zinc-700 text-zinc-300',
  running:   'bg-blue-900 text-blue-300',
  success:   'bg-green-900 text-green-300',
  error:     'bg-red-900 text-red-300',
  cancelled: 'bg-amber-900 text-amber-300',
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
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono shrink-0 ${pct >= 90 ? 'text-red-400' : pct >= 70 ? 'text-amber-400' : 'text-zinc-400'}`}>
        {(used / 1000).toFixed(0)}k / {(limit / 1000000).toFixed(1)}M ({pct.toFixed(0)}%)
      </span>
    </div>
  )
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [activeTab,  setActiveTab]  = useState<'overview' | 'users' | 'activity'>('overview')
  const [overview,   setOverview]   = useState<GroupDetailData | null>(null)
  const [members,    setMembers]    = useState<MemberRow[]>([])
  const [activity,   setActivity]   = useState<{
    runs: RunRow[]; reports: ReportRow[]; documents: DocRow[]; snapshots: SnapshotRow[]
  } | null>(null)
  const [loadingOv,  setLoadingOv]  = useState(true)
  const [loadingMem, setLoadingMem] = useState(false)
  const [loadingAct, setLoadingAct] = useState(false)
  const [showEdit,   setShowEdit]   = useState(false)

  function loadOverview() {
    setLoadingOv(true)
    fetch(`/api/admin/groups/${id}`)
      .then(r => r.json())
      .then(json => setOverview(json.data as GroupDetailData))
      .finally(() => setLoadingOv(false))
  }

  // Load overview on mount
  useEffect(() => { loadOverview() }, [id])

  // Lazy-load users + activity on tab switch
  useEffect(() => {
    if (activeTab === 'users' && members.length === 0 && !loadingMem) {
      setLoadingMem(true)
      fetch(`/api/admin/groups/${id}/members`)
        .then(r => r.json())
        .then(json => setMembers(json.data as MemberRow[]))
        .finally(() => setLoadingMem(false))
    }
    if (activeTab === 'activity' && !activity && !loadingAct) {
      setLoadingAct(true)
      fetch(`/api/admin/groups/${id}/activity`)
        .then(r => r.json())
        .then(json => setActivity(json.data as typeof activity))
        .finally(() => setLoadingAct(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const group = overview?.group

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/admin/groups" className="mt-1 text-zinc-500 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{group?.name ?? '…'}</h1>
              {group && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${TIER_BADGE[group.subscription_tier] ?? TIER_BADGE.starter}`}>
                  {group.subscription_tier}
                </span>
              )}
              {group && !group.is_active && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400">Inactive</span>
              )}
            </div>
            <p className="text-zinc-400 text-sm mt-0.5 font-mono">{id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {group && (
            <button
              onClick={() => setShowEdit(true)}
              className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded transition-colors"
            >
              Edit Group
            </button>
          )}
          {group && <ImpersonateButton groupId={group.id} groupName={group.name} />}
        </div>
      </div>

      {/* Token usage bar */}
      {group && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-5 py-3 flex items-center gap-4">
          <span className="text-xs text-zinc-500 uppercase tracking-wide shrink-0">Token Usage MTD</span>
          <TokenBar used={group.token_usage_mtd} limit={group.token_limit_mtd} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {(['overview', 'users', 'activity'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors -mb-px border-b-2 ${
              activeTab === tab
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-zinc-500 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {loadingOv && <p className="text-zinc-500 text-sm">Loading…</p>}

          {group && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                ['Name',         group.name],
                ['Slug',         group.slug ?? '—'],
                ['Palette',      group.palette_id ?? '—'],
                ['Created',      fmtDate(group.created_at)],
                ['Tier',         group.subscription_tier],
                ['Token Limit',  `${(group.token_limit_mtd / 1000000).toFixed(1)}M / mo`],
                ['Status',       group.is_active ? 'Active' : 'Inactive'],
                ['Owner ID',     group.owner_id ? group.owner_id.slice(0, 8) + '…' : '—'],
              ].map(([label, value]) => (
                <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
                  <p className="text-sm text-white mt-1 font-mono truncate">{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Companies */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Companies</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="px-5 py-2.5 text-left">Name</th>
                  <th className="px-4 py-2.5 text-right">Divisions</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                  <th className="px-4 py-2.5 text-center">Xero</th>
                  <th className="px-5 py-2.5 text-left">Last Synced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {(overview?.companies ?? []).map(c => (
                  <tr key={c.id} className="hover:bg-zinc-800/30">
                    <td className="px-5 py-2.5 text-white">{c.name}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-400">{c.division_count}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${c.is_active ? 'bg-green-900 text-green-300' : 'bg-zinc-700 text-zinc-400'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {c.has_xero
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                        : <XCircle className="h-4 w-4 text-zinc-600 mx-auto" />}
                    </td>
                    <td className="px-5 py-2.5 text-zinc-400">{fmtDate(c.last_synced_at)}</td>
                  </tr>
                ))}
                {(overview?.companies ?? []).length === 0 && !loadingOv && (
                  <tr><td colSpan={5} className="px-5 py-4 text-zinc-500 text-center">No companies.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Storage */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Storage Usage</h3>
            </div>
            <div className="divide-y divide-zinc-800">
              {(overview?.storage_files ?? []).map(f => (
                <div key={f.bucket} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-zinc-300 font-mono">{f.bucket}</span>
                  <span className="text-sm text-white font-semibold">{f.count} files</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Users Tab ── */}
      {activeTab === 'users' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left">Email</th>
                <th className="px-5 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-center">Default</th>
                <th className="px-5 py-3 text-left">Joined</th>
                <th className="px-5 py-3 text-left">Last Sign In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loadingMem && (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-zinc-500">Loading…</td></tr>
              )}
              {!loadingMem && members.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-6 text-center text-zinc-500">No members.</td></tr>
              )}
              {members.map(m => (
                <tr key={m.user_id} className="hover:bg-zinc-800/30">
                  <td className="px-5 py-3 text-white">{m.email}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300 capitalize">{m.role.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {m.is_default ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" /> : null}
                  </td>
                  <td className="px-5 py-3 text-zinc-400">{fmtDate(m.joined_at)}</td>
                  <td className="px-5 py-3 text-zinc-400">{fmtDate(m.last_sign_in_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Activity Tab ── */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          {loadingAct && <p className="text-zinc-500 text-sm">Loading…</p>}

          {/* Agent runs */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Recent Agent Runs</h3>
            </div>
            <div className="divide-y divide-zinc-800">
              {(activity?.runs ?? []).map(r => {
                const dur = r.started_at && r.completed_at
                  ? `${Math.round((new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()) / 1000)}s`
                  : null
                return (
                  <Link key={r.id} href={`/admin/agent-runs/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/40 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{r.agent_name ?? 'Unknown'}</p>
                      <p className="text-xs text-zinc-500">{fmtDate(r.created_at)}{r.tokens_used ? ` · ${r.tokens_used.toLocaleString()} tokens` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {dur && <span className="text-xs text-zinc-500">{dur}</span>}
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] ?? STATUS_BADGE.queued}`}>{r.status}</span>
                    </div>
                  </Link>
                )
              })}
              {!loadingAct && (activity?.runs ?? []).length === 0 && (
                <p className="px-5 py-4 text-sm text-zinc-500">No runs.</p>
              )}
            </div>
          </div>

          {/* Reports */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Recent Reports</h3>
            </div>
            <div className="divide-y divide-zinc-800">
              {(activity?.reports ?? []).map(r => (
                <div key={r.id} className="flex items-center justify-between px-5 py-3">
                  <p className="text-sm text-white truncate">{r.name}</p>
                  <span className="text-xs text-zinc-500 shrink-0 ml-4">{fmtDate(r.created_at)}</span>
                </div>
              ))}
              {!loadingAct && (activity?.reports ?? []).length === 0 && (
                <p className="px-5 py-4 text-sm text-zinc-500">No reports.</p>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Recent Documents</h3>
            </div>
            <div className="divide-y divide-zinc-800">
              {(activity?.documents ?? []).map(d => (
                <div key={d.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{d.title}</p>
                    <p className="text-xs text-zinc-500 capitalize">{d.document_type.replace(/_/g, ' ')}</p>
                  </div>
                  <span className="text-xs text-zinc-500 shrink-0 ml-4">{fmtDate(d.created_at)}</span>
                </div>
              ))}
              {!loadingAct && (activity?.documents ?? []).length === 0 && (
                <p className="px-5 py-4 text-sm text-zinc-500">No documents.</p>
              )}
            </div>
          </div>

          {/* Cash flow snapshots */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Recent Cash Flow Snapshots</h3>
            </div>
            <div className="divide-y divide-zinc-800">
              {(activity?.snapshots ?? []).map(s => (
                <div key={s.id} className="flex items-center justify-between px-5 py-3">
                  <p className="text-sm text-white truncate">{s.name}</p>
                  <span className="text-xs text-zinc-500 shrink-0 ml-4">{fmtDate(s.created_at)}</span>
                </div>
              ))}
              {!loadingAct && (activity?.snapshots ?? []).length === 0 && (
                <p className="px-5 py-4 text-sm text-zinc-500">No snapshots.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEdit && group && (
        <GroupFormModal
          group={group}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); loadOverview() }}
        />
      )}
    </div>
  )
}
