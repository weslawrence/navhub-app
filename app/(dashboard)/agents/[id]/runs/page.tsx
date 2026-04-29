'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Play, CheckCircle2, XCircle, Clock, Loader2,
  AlertCircle, ChevronLeft, ChevronRight, MessageSquare,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn }    from '@/lib/utils'
import type { Agent, AgentRun, RunStatus } from '@/lib/types'

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<RunStatus, { label: string; icon: React.ComponentType<{ className?: string }>; class: string }> = {
  queued:          { label: 'Queued',         icon: Clock,          class: 'bg-muted text-muted-foreground' },
  running:         { label: 'Running',        icon: Loader2,        class: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  cancelling:      { label: 'Cancelling…',    icon: Loader2,        class: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  success:         { label: 'Complete',       icon: CheckCircle2,   class: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  error:           { label: 'Error',          icon: XCircle,        class: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  cancelled:       { label: 'Cancelled',      icon: AlertCircle,    class: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  awaiting_input:  { label: 'Reply needed',   icon: MessageSquare,  class: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued
  const Icon = cfg.icon
  return (
    <Badge className={cn('gap-1 text-xs font-normal', cfg.class)}>
      <Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {cfg.label}
    </Badge>
  )
}

// Run list view shows amber "Reply needed" link to the run
function AwaitingInputIndicator({ runId }: { runId: string }) {
  return (
    <Link href={`/agents/runs/${runId}`} className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-0.5 hover:underline">
      <MessageSquare className="h-2.5 w-2.5" /> Reply needed
    </Link>
  )
}

function duration(run: AgentRun): string {
  if (!run.started_at || !run.completed_at) return '—'
  const ms = new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(iso).toLocaleDateString()
}

// ─── Runs page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

export default function AgentRunsPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [agent,     setAgent]     = useState<Agent | null>(null)
  const [runs,      setRuns]      = useState<AgentRun[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(0)
  const [loading,   setLoading]   = useState(true)

  const loadRuns = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const [agRes, runsRes] = await Promise.all([
        fetch(`/api/agents/${params.id}`),
        fetch(`/api/agents/${params.id}/runs?limit=${PAGE_SIZE}&offset=${p * PAGE_SIZE}`),
      ])
      const agJson   = await agRes.json()
      const runsJson = await runsRes.json()
      if (agJson.data)   setAgent(agJson.data)
      if (runsJson.data) { setRuns(runsJson.data); setTotal(runsJson.total ?? 0) }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => { void loadRuns(page) }, [loadRuns, page])

  // Refresh while any run is in an active state (queued / running / awaiting_input).
  // Catches status changes triggered from the run detail page (e.g. cancel)
  // without making the user reload manually.
  useEffect(() => {
    const hasActive = runs.some(r =>
      ['queued', 'running', 'awaiting_input'].includes(r.status as string),
    )
    if (!hasActive) return
    const interval = setInterval(() => { void loadRuns(page) }, 10_000)
    return () => clearInterval(interval)
  }, [runs, loadRuns, page])

  // Refresh on window focus — typical when returning from /agents/runs/[id]
  useEffect(() => {
    function onFocus() { void loadRuns(page) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadRuns, page])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/agents"><ArrowLeft className="h-4 w-4 mr-1" /> Agents</Link>
        </Button>
        {agent && (
          <>
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
              style={{ backgroundColor: agent.avatar_color }}
            >
              {agent.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
            </div>
            <h1 className="text-xl font-bold flex-1">{agent.name} — Run History</h1>
            <Button size="sm" onClick={() => router.push(`/agents/${params.id}/run`)}>
              <Play className="h-3.5 w-3.5 mr-1.5" /> Run Now
            </Button>
          </>
        )}
      </div>

      {/* Runs table */}
      {loading && runs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
          </CardContent>
        </Card>
      ) : runs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No runs yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Runs</span>
              <span className="text-xs font-normal text-muted-foreground">{total} total</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Started</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Duration</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Model</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Output</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {runs.map(run => (
                    <tr key={run.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <RunStatusBadge status={run.status} />
                          {run.triggered_by === 'schedule' && (
                            <Badge className="gap-1 text-xs font-normal bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                              <Clock className="h-3 w-3" />
                              Scheduled
                            </Badge>
                          )}
                        </div>
                        {run.status === 'awaiting_input' && (
                          <AwaitingInputIndicator runId={run.id} />
                        )}
                        {run.input_context?.extra_instructions && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[160px] truncate">
                            {run.input_context.extra_instructions.length > 60
                              ? run.input_context.extra_instructions.slice(0, 57) + '…'
                              : run.input_context.extra_instructions}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {run.started_at ? relativeTime(run.started_at) : relativeTime(run.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {duration(run)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {run.model_used
                          ? run.model_used.includes('opus') ? 'Opus 4'
                            : run.model_used === 'gpt-4o' ? 'GPT-4o'
                            : 'Sonnet 4'
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                        <span className="truncate block">
                          {run.output ? run.output.slice(0, 100) + (run.output.length > 100 ? '…' : '') : run.error_message ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" asChild>
                          <Link href={`/agents/runs/${run.id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  )
}
