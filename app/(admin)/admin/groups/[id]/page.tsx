'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter }              from 'next/navigation'
import Link                                  from 'next/link'
import {
  Crown, AlertTriangle, Loader2, ArrowLeft,
} from 'lucide-react'
import { Button }          from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label }           from '@/components/ui/label'
import { cn }              from '@/lib/utils'

const ROLE_LABELS: Record<string, string> = {
  super_admin:  'Super Admin',
  group_owner:  'Owner',
  group_admin:  'Group Admin',
  manager:      'Manager',
  viewer:       'Viewer',
}

const COMPLEXITY_LABELS: Record<string, string> = {
  standard:     '☕ Standard',
  medium:       '💪 Medium',
  large:        '🏋️ Large',
  massive:      '🔥 Massive',
  professional: '⚡ Professional',
}

interface GroupMember {
  user_id:    string
  email:      string
  role:       string
  created_at: string
}

interface GroupRun {
  id:          string
  run_name:    string | null
  status:      string
  tokens_used: number | null
  created_at:  string
  agent_name:  string
}

interface GroupDetail {
  id:                  string
  name:                string
  is_active:           boolean
  created_at:          string
  timezone:            string | null
  max_task_complexity: string | null
  palette_id:          string | null
  owner_user_id:       string | null
}

export default function AdminGroupDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [group,   setGroup]   = useState<GroupDetail | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [runs,    setRuns]    = useState<GroupRun[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<'overview' | 'members' | 'runs'>('overview')

  // Transfer ownership state
  const [showTransferDialog,   setShowTransferDialog]   = useState(false)
  const [transferToId,         setTransferToId]         = useState('')
  const [transferConfirmText,  setTransferConfirmText]  = useState('')
  const [transferring,         setTransferring]         = useState(false)
  const [transferError,        setTransferError]        = useState<string | null>(null)

  const currentOwner = members.find(m => m.role === 'group_owner')

  const loadGroup = useCallback(async () => {
    const res  = await fetch(`/api/admin/groups/${params.id}`)
    const json = await res.json()
    // GET route returns { data: { group, companies, storage_files } }
    setGroup((json.data?.group ?? json.data) ?? null)
  }, [params.id])

  const loadMembers = useCallback(async () => {
    const res  = await fetch(`/api/admin/groups/${params.id}/members`)
    const json = await res.json()
    setMembers(json.data ?? [])
  }, [params.id])

  const loadRuns = useCallback(async () => {
    const res  = await fetch(`/api/admin/groups/${params.id}/runs?limit=20`)
    const json = await res.json()
    setRuns(json.data ?? [])
  }, [params.id])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadGroup(), loadMembers(), loadRuns()])
      .finally(() => setLoading(false))
  }, [loadGroup, loadMembers, loadRuns])

  async function handleTransferOwnership() {
    if (!transferToId || transferConfirmText !== group?.name) return
    setTransferring(true)
    setTransferError(null)
    try {
      const res = await fetch(`/api/admin/groups/${params.id}/transfer-owner`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ new_owner_id: transferToId }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Transfer failed')
      }
      await Promise.all([loadGroup(), loadMembers()])
      setShowTransferDialog(false)
      setTransferToId('')
      setTransferConfirmText('')
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Transfer failed')
    } finally {
      setTransferring(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )

  if (!group) return (
    <div className="p-6 text-sm text-muted-foreground">Group not found.</div>
  )

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Link href="/admin/groups" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to groups
          </Link>
          <h1 className="text-xl font-semibold">{group.name}</h1>
          <p className="text-xs text-muted-foreground">
            ID: {group.id.slice(0, 8)} · Created {new Date(group.created_at).toLocaleDateString('en-AU')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-xs px-2 py-1 rounded-full font-medium',
            group.is_active
              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
          )}>
            {group.is_active ? '● Active' : '● Inactive'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['overview', 'members', 'runs'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm capitalize border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t}
            {t === 'members' && members.length > 0 && (
              <span className="ml-1.5 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                {members.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="space-y-4 max-w-2xl">
          {/* Details */}
          <div className="border rounded-lg divide-y text-sm">
            {[
              ['Timezone',       group.timezone ?? '—'],
              ['Max complexity', COMPLEXITY_LABELS[group.max_task_complexity ?? 'massive'] ?? '—'],
              ['Palette',        group.palette_id ?? 'default'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>

          {/* Owner */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <Crown className="h-4 w-4 text-amber-500" />
              Group Owner
            </h3>
            {currentOwner ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-sm font-medium">{currentOwner.email}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTransferDialog(true)}
                >
                  Transfer ownership →
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">No owner assigned</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTransferDialog(true)}
                >
                  Assign owner →
                </Button>
              </div>
            )}
          </div>

          {/* Usage */}
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-medium mb-3">Usage</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{members.length}</p>
                <p className="text-xs text-muted-foreground">Members</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{runs.length}</p>
                <p className="text-xs text-muted-foreground">Recent runs</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {(runs.reduce((sum, r) => sum + (r.tokens_used ?? 0), 0) / 1000).toFixed(0)}k
                </p>
                <p className="text-xs text-muted-foreground">Tokens</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div className="max-w-2xl">
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No members found.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                    <tr key={m.user_id} className={cn('border-b last:border-0', i % 2 === 0 ? '' : 'bg-muted/20')}>
                      <td className="px-4 py-2.5 font-medium">{m.email}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          m.role === 'group_owner'  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' :
                          m.role === 'super_admin'  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                          m.role === 'group_admin'  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                          'bg-muted text-muted-foreground'
                        )}>
                          {m.role === 'group_owner' && '👑 '}
                          {ROLE_LABELS[m.role] ?? m.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {new Date(m.created_at).toLocaleDateString('en-AU')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Runs tab */}
      {tab === 'runs' && (
        <div className="max-w-3xl">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No runs found.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Run</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Agent</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Tokens</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run, i) => (
                    <tr key={run.id} className={cn('border-b last:border-0 hover:bg-muted/20 cursor-pointer', i % 2 === 0 ? '' : 'bg-muted/10')}
                      onClick={() => router.push(`/admin/agent-runs/${run.id}`)}>
                      <td className="px-4 py-2.5 font-medium truncate max-w-[200px]">
                        {run.run_name ?? 'Untitled'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{run.agent_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('text-xs', run.status === 'success' ? 'text-green-600' : run.status === 'error' || run.status === 'failed' ? 'text-red-600' : 'text-muted-foreground')}>
                          {run.status === 'success' ? '✓' : run.status === 'error' || run.status === 'failed' ? '✗' : '○'} {run.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {run.tokens_used ? `${(run.tokens_used / 1000).toFixed(0)}k` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {new Date(run.created_at).toLocaleDateString('en-AU')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Transfer ownership dialog */}
      <Dialog open={showTransferDialog} onOpenChange={open => {
        if (!open) { setTransferToId(''); setTransferConfirmText(''); setTransferError(null) }
        setShowTransferDialog(open)
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Transfer group ownership
            </DialogTitle>
            <DialogDescription>
              This is a significant action. The current owner will be demoted to Group Admin
              and will lose the ability to manage other admins.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {currentOwner && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Current owner: </span>
                <span className="font-medium">{currentOwner.email}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Transfer to</Label>
              <select
                value={transferToId}
                onChange={e => setTransferToId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Select a member —</option>
                {members
                  .filter(m => m.role !== 'super_admin' && m.user_id !== currentOwner?.user_id)
                  .map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.email} ({ROLE_LABELS[m.role] ?? m.role})
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>
                Type <strong>{group.name}</strong> to confirm
              </Label>
              <input
                type="text"
                value={transferConfirmText}
                onChange={e => setTransferConfirmText(e.target.value)}
                placeholder={group.name}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>

            {transferError && (
              <p className="text-sm text-red-600">{transferError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!transferToId || transferConfirmText !== group.name || transferring}
              onClick={handleTransferOwnership}
            >
              {transferring && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Transfer ownership
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
