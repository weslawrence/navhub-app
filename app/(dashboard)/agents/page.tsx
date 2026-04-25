'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter }  from 'next/navigation'
import Link from 'next/link'
import {
  Bot, Plus, Play, Settings, Clock, Zap, PowerOff, CalendarClock,
  LayoutGrid, List, UserCircle2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button }  from '@/components/ui/button'
import { Badge }   from '@/components/ui/badge'
import { cn }      from '@/lib/utils'
import ScheduledRunsPanel  from '@/components/agents/ScheduledRunsPanel'
import type { Agent, AgentTool } from '@/lib/types'
import { AVATAR_PRESET_MAP } from '@/lib/agent-presets'

// ─── Tool display config ──────────────────────────────────────────────────────

const TOOL_LABELS: Record<AgentTool, string> = {
  read_financials:          'Financials',
  generate_report:          'Reports',
  send_slack:               'Slack',
  send_email:               'Email',
  list_report_templates:    'List Templates',
  read_report_template:     'Read Template',
  create_report_template:   'Create Template',
  update_report_template:   'Update Template',
  render_report:            'Render Report',
  analyse_document:         'Analyse Doc',
  list_documents:           'List Docs',
  read_document:            'Read Doc',
  create_document:          'Create Doc',
  update_document:          'Update Doc',
  read_cashflow:            'Cash Flow',
  read_cashflow_items:      'CF Items',
  suggest_cashflow_item:    'Suggest CF Item',
  update_cashflow_item:     'Update CF Item',
  create_cashflow_snapshot: 'CF Snapshot',
  summarise_cashflow:       'Summarise CF',
  read_marketing_data:      'Marketing Data',
  summarise_marketing:      'Summarise Mktg',
  ask_user:                 'Ask User',
  read_attachment:          'Read Attachment',
}

// ─── Agent avatar ─────────────────────────────────────────────────────────────

function AgentAvatar({ agent, size = 'md' }: { agent: Agent; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 32 : size === 'lg' ? 56 : 40
  const fontSize = size === 'sm' ? 14 : size === 'lg' ? 28 : 18

  if (agent.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={agent.avatar_url} alt={agent.name}
        className="rounded-full object-cover shrink-0" style={{ width: dims, height: dims }} />
    )
  }

  if (agent.avatar_preset && AVATAR_PRESET_MAP[agent.avatar_preset]) {
    return (
      <div className="rounded-full flex items-center justify-center shrink-0"
        style={{ width: dims, height: dims, backgroundColor: agent.avatar_color + '20', fontSize: fontSize * 1.2 }}>
        {AVATAR_PRESET_MAP[agent.avatar_preset]}
      </div>
    )
  }

  const initials = agent.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div className="rounded-full flex items-center justify-center font-semibold text-white shrink-0"
      style={{ width: dims, height: dims, backgroundColor: agent.avatar_color, fontSize }}>
      {initials}
    </div>
  )
}

// ─── Agents list page ─────────────────────────────────────────────────────────

type AgentView = 'tiles' | 'list' | 'avatar'

export default function AgentsPage() {
  const searchParams   = useSearchParams()
  const router         = useRouter()
  const briefParam     = searchParams.get('brief') ?? ''
  const agentNameParam = searchParams.get('agent_name') ?? ''

  const [agents,       setAgents]       = useState<Agent[]>([])
  const [loading,      setLoading]      = useState(true)
  const [isAdmin,      setIsAdmin]      = useState(false)
  const [scheduleAgentId,  setScheduleAgentId]  = useState<string | null>(null)
  const [view,             setView]             = useState<AgentView>('tiles')

  // Restore view from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('navhub:agents:view') as AgentView | null
    if (saved === 'tiles' || saved === 'list' || saved === 'avatar') setView(saved)
  }, [])

  const loadAgents = useCallback(async () => {
    const [agRes, grRes] = await Promise.all([
      fetch('/api/agents'),
      fetch('/api/groups/active'),
    ])
    const agJson = await agRes.json()
    const grJson = await grRes.json()
    if (agJson.data) setAgents(agJson.data)
    if (grJson.data) setIsAdmin(grJson.data.is_admin)
    setLoading(false)
  }, [])

  useEffect(() => { void loadAgents() }, [loadAgents])

  // Re-fetch agents when window regains focus (e.g. after returning from edit page)
  useEffect(() => {
    function handleFocus() { void loadAgents() }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [loadAgents])

  // Redirect to /agents/[id]/run when ?brief= param is present
  // (used by NavHub Assistant "Launch Agent" flow).
  useEffect(() => {
    if (loading || !briefParam) return
    const activeAgents = agents.filter(a => a.is_active)
    if (activeAgents.length === 0) return
    let targetAgent: Agent | null = null
    if (agentNameParam) {
      const decoded = decodeURIComponent(agentNameParam).toLowerCase().trim()
      targetAgent =
        activeAgents.find(a => a.name.toLowerCase() === decoded) ??             // exact
        activeAgents.find(a => a.name.toLowerCase().includes(decoded)) ??       // agent contains param
        activeAgents.find(a => decoded.includes(a.name.toLowerCase())) ??       // param contains agent
        null
    }
    if (!targetAgent) targetAgent = agentNameParam ? null : activeAgents[0]
    if (targetAgent) {
      const q = new URLSearchParams({ brief: decodeURIComponent(briefParam) })
      router.push(`/agents/${targetAgent.id}/run?${q.toString()}`)
    }
  }, [loading, briefParam, agentNameParam, agents, router]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggleActive(agent: Agent) {
    const newValue = !agent.is_active
    // Optimistic update
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_active: newValue } : a))

    const res = await fetch(`/api/agents/${agent.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_active: newValue }),
    })

    if (!res.ok) {
      // Revert on error
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_active: agent.is_active } : a))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6" /> AI Agents
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure and run AI agents that analyse your financial data and take action
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View selector */}
          <div className="flex items-center border rounded-md overflow-hidden">
            <button onClick={() => { setView('tiles'); localStorage.setItem('navhub:agents:view','tiles') }} title="Tile view"
              className={cn('px-2 py-1.5', view === 'tiles' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => { setView('list'); localStorage.setItem('navhub:agents:view','list') }} title="List view"
              className={cn('px-2 py-1.5 border-x', view === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              <List className="h-4 w-4" />
            </button>
            <button onClick={() => { setView('avatar'); localStorage.setItem('navhub:agents:view','avatar') }} title="Avatar view"
              className={cn('px-2 py-1.5', view === 'avatar' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              <UserCircle2 className="h-4 w-4" />
            </button>
          </div>
          {isAdmin && (
            <Button size="sm" asChild>
              <Link href="/agents/new"><Plus className="h-4 w-4 mr-1.5" /> New Agent</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5 space-y-3">
                <div className="flex gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bot className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-base font-medium text-muted-foreground">No agents yet</p>
            {isAdmin ? (
              <div className="mt-4">
                <Button size="sm" asChild>
                  <Link href="/agents/new"><Plus className="h-4 w-4 mr-1.5" /> Create your first agent</Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Your group admins haven&apos;t created any agents yet.</p>
            )}
          </CardContent>
        </Card>
      ) : view === 'list' ? (
        /* List view */
        <div className="divide-y border rounded-lg">
          {agents.map(agent => (
            <div
              key={agent.id}
              onClick={() => agent.is_active && router.push(`/agents/${agent.id}/run`)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors',
                agent.is_active && 'cursor-pointer',
              )}
            >
              <AgentAvatar agent={agent} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{agent.name}</p>
                {agent.description && <p className="text-xs text-muted-foreground truncate">{agent.description}</p>}
              </div>
              <span className={cn('text-xs px-2 py-0.5 rounded-full', agent.visibility === 'public' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground')}>
                {agent.visibility === 'public' ? 'Public' : 'Private'}
              </span>
              <Badge variant="outline" className="text-[10px] shrink-0">{agent.ai_model ?? agent.model_name ?? agent.model}</Badge>
              <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                {!agent.is_active ? null : (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => router.push(`/agents/${agent.id}/run`)} title="Run"><Play className="h-3.5 w-3.5" /></Button>
                )}
                {isAdmin && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild title="Configure">
                    <Link href={`/agents/${agent.id}/edit`}><Settings className="h-3.5 w-3.5" /></Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : view === 'avatar' ? (
        /* Avatar view — click opens run page; Configure button navigates to edit */
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          {agents.map(agent => (
            <div
              key={agent.id}
              onClick={() => agent.is_active && router.push(`/agents/${agent.id}/run`)}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-xl border bg-card hover:bg-muted/50 transition-colors group',
                agent.is_active && 'cursor-pointer',
              )}
            >
              <AgentAvatar agent={agent} size="lg" />
              <p className="text-sm font-medium text-center leading-tight">{agent.name}</p>
              <span className={cn('text-[10px] px-2 py-0.5 rounded-full', agent.visibility === 'public' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground')}>
                {agent.visibility === 'public' ? 'Public' : 'Private'}
              </span>
              {isAdmin && (
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => { e.stopPropagation(); router.push(`/agents/${agent.id}/edit`) }}
                >
                  Configure
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Tiles view (default) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isAdmin={isAdmin}
              onRun={() => router.push(`/agents/${agent.id}/run`)}
              onToggleActive={() => void handleToggleActive(agent)}
              onSchedule={() => setScheduleAgentId(agent.id)}
            />
          ))}
        </div>
      )}
      {scheduleAgentId && (
        <ScheduledRunsPanel
          agentId={scheduleAgentId}
          agentName={agents.find(a => a.id === scheduleAgentId)?.name ?? ''}
          onClose={() => setScheduleAgentId(null)}
        />
      )}
    </div>
  )
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent, isAdmin, onRun, onToggleActive, onSchedule,
}: {
  agent:          Agent
  isAdmin:        boolean
  onRun:          () => void
  onToggleActive: () => void
  onSchedule:     () => void
}) {
  const isDisabled = !agent.is_active

  const model = agent.ai_model ?? agent.model_name ?? agent.model ?? ''
  const modelShort = model.includes('opus')        ? 'Opus'
    : model.includes('sonnet')                     ? 'Sonnet'
    : model.includes('haiku')                      ? 'Haiku'
    : model === 'gpt-4o'                           ? 'GPT-4o'
    : model.includes('gpt-4o-mini')                ? 'GPT-4o mini'
    : model.includes('gemini')                     ? 'Gemini'
    : model.split('-')[0] ?? model

  return (
    <Card
      onClick={() => { if (!isDisabled) onRun() }}
      className={cn(
        'transition-colors',
        isDisabled ? 'opacity-60' : 'hover:border-primary/40 cursor-pointer',
      )}
    >
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <AgentAvatar agent={agent} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold truncate">{agent.name}</p>
              {agent.visibility === 'private' && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                  Private
                </Badge>
              )}
              {isDisabled && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0 flex items-center gap-0.5">
                  <PowerOff className="h-2.5 w-2.5" /> Disabled
                </Badge>
              )}
            </div>
            {agent.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</p>
            )}
            {agent.schedule_enabled && agent.next_scheduled_run_at && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                Next: {new Date(agent.next_scheduled_run_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
          {/* Active/Disabled toggle pill — admins only */}
          {isAdmin && (
            <button
              onClick={e => { e.stopPropagation(); onToggleActive() }}
              title={isDisabled ? 'Enable agent' : 'Disable agent'}
              className={cn(
                'shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors',
                isDisabled
                  ? 'border-zinc-300 dark:border-zinc-600 text-zinc-500 dark:text-zinc-400 hover:border-green-400 dark:hover:border-green-500 hover:text-green-600 dark:hover:text-green-400'
                  : 'border-green-400/50 text-green-600 dark:text-green-400 hover:border-red-400/50 hover:text-red-600 dark:hover:text-red-400'
              )}
            >
              {isDisabled ? '○ Off' : '● On'}
            </button>
          )}
        </div>

        {/* Meta */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Zap className="h-3 w-3" />
            <span>{modelShort}</span>
          </div>
          {agent.tools.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {agent.tools.map(tool => (
                <Badge key={tool} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {TOOL_LABELS[tool] ?? tool}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1" onClick={e => e.stopPropagation()}>
          {!isDisabled && (
            <Button size="sm" className="flex-1" onClick={onRun} title="Run agent">
              <Play className="h-3.5 w-3.5 mr-1.5" /> Run
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" asChild className={cn(isDisabled && 'ml-auto')} title="Configure">
              <Link href={`/agents/${agent.id}/edit`}>
                <Settings className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
          <Button size="sm" variant="outline" title="Scheduled runs"
            onClick={onSchedule}
            className={cn(agent.schedule_enabled && 'border-amber-300 text-amber-600')}>
            <CalendarClock className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" asChild title="Run history">
            <Link href={`/agents/${agent.id}/runs`}>
              <Clock className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
