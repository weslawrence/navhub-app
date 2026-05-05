'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, ArrowRight, BarChart3, Bot, FileText, Plus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface GroupMembership {
  group_id:      string
  group_name:    string
  role:          string
  company_count: number
  is_default:    boolean
}

export default function LandingPage() {
  const router = useRouter()
  const [email,         setEmail]         = useState<string>('')
  const [memberships,   setMemberships]   = useState<GroupMembership[]>([])
  const [loading,       setLoading]       = useState(true)
  const [enteringGroup, setEnteringGroup] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newGroupName,  setNewGroupName]  = useState('')
  const [creating,      setCreating]      = useState(false)
  const [isSuperAdmin,  setIsSuperAdmin]  = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      setEmail(session.user.email ?? '')

      // Best-effort: claim any pending group invites tied to this email
      // BEFORE we read memberships, so a freshly-invited user lands inside
      // their group(s) on first visit instead of seeing an empty list.
      // Idempotent — safe to call on every load.
      try {
        await fetch('/api/auth/claim-invites', { method: 'POST' })
      } catch { /* non-fatal */ }

      // Fetch all group memberships with group names and company counts
      const { data } = await supabase
        .from('user_groups')
        .select('group_id, role, is_default, groups(name, companies(count))')
        .eq('user_id', session.user.id)

      type RawMembership = {
        group_id:   unknown
        role:       unknown
        is_default: unknown
        groups:     unknown
      }
      const mapped: GroupMembership[] = ((data ?? []) as RawMembership[]).map(ug => {
        const grp = ug.groups as { name?: string; companies?: { count?: number }[] } | null
        return {
          group_id:      String(ug.group_id ?? ''),
          group_name:    grp?.name ?? 'Unknown Group',
          role:          String(ug.role ?? ''),
          company_count: grp?.companies?.[0]?.count ?? 0,
          is_default:    !!ug.is_default,
        }
      })

      setMemberships(mapped)

      // Check super_admin
      const hasSA = mapped.some(m => m.role === 'super_admin')
      setIsSuperAdmin(hasSA)
      setLoading(false)
    }
    void load()
  }, [router])

  async function enterGroup(groupId: string) {
    setEnteringGroup(groupId)
    try {
      await fetch('/api/groups/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      })
      router.push('/dashboard')
    } catch {
      setEnteringGroup(null)
    }
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName.trim() }),
      })
      const json = await res.json() as { data?: { id: string } }
      if (json.data?.id) {
        await enterGroup(json.data.id)
      }
    } catch {
      setCreating(false)
    }
  }

  const FEATURES = [
    { icon: <BarChart3 className="h-5 w-5 text-sky-400" />, title: 'Financial Intelligence', desc: 'Real-time P&L, Balance Sheet, and cash flow across all your entities' },
    { icon: <Bot className="h-5 w-5 text-violet-400" />, title: 'AI Agents', desc: 'Configure agents to analyse data, generate reports, and complete tasks automatically' },
    { icon: <FileText className="h-5 w-5 text-emerald-400" />, title: 'Documents & Reports', desc: 'Generate, store, and share financial reports and business documents' },
  ]

  const STEPS = [
    'Ask your administrator to invite you to an existing group',
    'Or create your own group and invite your team',
    'Connect your accounting software (Xero) or upload financial data',
    'Set up AI agents to analyse and report on your data',
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      {/* Header */}
      <header className="border-b border-white/[0.07] px-6 py-4 flex items-center justify-between">
        <div className="text-xl font-bold">
          <span className="text-sky-400">nav</span><span className="text-white/60">hub</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{email}</span>
          <button
            onClick={() => void handleSignOut()}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-14">
        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold text-white">Welcome to NavHub</h1>
          <p className="text-lg text-slate-400">Your intelligent financial platform for business groups</p>
        </div>

        {/* Your Groups */}
        {memberships.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Your Groups</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {memberships.map(m => (
                <div key={m.group_id} className="p-5 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{m.group_name}</span>
                      {m.is_default && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="capitalize">{m.role.replace(/_/g, ' ')}</span>
                      <span>·</span>
                      <span>{m.company_count} {m.company_count === 1 ? 'company' : 'companies'}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => void enterGroup(m.group_id)}
                    disabled={enteringGroup === m.group_id}
                    className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {enteringGroup === m.group_id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <ArrowRight className="h-3.5 w-3.5" />
                    }
                    Enter
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* No Groups */}
        {memberships.length === 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-200">
            <p className="font-semibold mb-1">You don&apos;t have access to any groups yet</p>
            <p className="text-amber-300/70">Contact your administrator to be added to a group, or create a new one below.</p>
          </div>
        )}

        {/* Create a Group */}
        {(isSuperAdmin || memberships.length === 0) && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Create a Group</h2>
            <div className="p-5 rounded-xl border border-white/[0.08] bg-white/[0.03] space-y-3">
              <p className="text-sm text-slate-400">Set up your own group, add companies, and invite your team.</p>
              {!showCreateForm ? (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="flex items-center gap-1.5 border border-white/15 hover:border-white/30 text-slate-300 hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create New Group
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="Group name"
                    className="flex-1 bg-white/[0.05] border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-sky-500/50"
                    onKeyDown={e => { if (e.key === 'Enter') void handleCreateGroup() }}
                  />
                  <button
                    onClick={() => void handleCreateGroup()}
                    disabled={creating || !newGroupName.trim()}
                    className="bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
                  </button>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="text-slate-500 hover:text-slate-300 text-sm px-2"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Features */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">What is NavHub?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div key={f.title} className="p-5 rounded-xl border border-white/[0.07] bg-white/[0.02] space-y-2">
                {f.icon}
                <p className="text-sm font-medium text-white">{f.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How to Get Started (only when no groups) */}
        {memberships.length === 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white">How to Get Started</h2>
            <ol className="space-y-3">
              {STEPS.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="shrink-0 h-6 w-6 rounded-full border border-sky-500/40 bg-sky-500/10 flex items-center justify-center text-xs font-bold text-sky-400">
                    {i + 1}
                  </span>
                  <span className="text-sm text-slate-400 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-slate-600">How-to guides coming soon</p>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.07] px-6 py-4 text-center text-xs text-slate-600">
        NavHub ·{' '}
        <a href="mailto:support@navhub.co" className="hover:text-slate-400 transition-colors">
          Support
        </a>
      </footer>
    </div>
  )
}
