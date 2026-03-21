'use client'

import { useState, useEffect } from 'react'
import { useSearchParams }  from 'next/navigation'
import Link from 'next/link'
import {
  Bot, Plus, Play, Pencil, Clock, Zap, PowerOff,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button }  from '@/components/ui/button'
import { Badge }   from '@/components/ui/badge'
import { cn }      from '@/lib/utils'
import RunModal    from '@/components/agents/RunModal'
import type { Agent, AgentTool } from '@/lib/types'

// ─── Tool display config ──────────────────────────────────────────────────────

const TOOL_LABELS: Record<AgentTool, string> = {
  read_financials:          'Financials',
  read_companies:           'Companies',
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
}

// ─── Agent avatar ─────────────────────────────────────────────────────────────

function AgentAvatar({ agent, size = 'md' }: { agent: Agent; size?: 'sm' | 'md' | 'lg' }) {
  const initials = agent.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()

  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-14 w-14 text-xl' : 'h-10 w-10 text-sm'

  return (
    <div
      className={cn('rounded-full flex items-center justify-center font-semibold text-white shrink-0', sizeClass)}
      style={{ backgroundColor: agent.avatar_color }}
    >
      {initials}
    </div>
  )
}

// ─── Agents list page ─────────────────────────────────────────────────────────

export default function AgentsPage() {
  const searchParams   = useSearchParams()
  const briefParam     = searchParams.get('brief') ?? ''
  const agentNameParam = searchParams.get('agent_name') ?? ''

  const [agents,       setAgents]       = useState<Agent[]>([])
  const [loading,      setLoading]      = useState(true)
  const [isAdmin,      setIsAdmin]      = useState(false)
  const [runTarget,    setRunTarget]    = useState<Agent | null>(null)
  const [initialBrief, setInitialBrief] = useState(briefParam)

  useEffect(() => {
    async function load() {
      const [agRes, grRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/groups/active'),
      ])
      const agJson = await agRes.json()
      const grJson = await grRes.json()
      if (agJson.data) setAgents(agJson.data)
      if (grJson.data) setIsAdmin(grJson.data.is_admin)
      setLoading(false)
    }
    void load()
  }, [])

  // Auto-open RunModal when ?brief= param is present and agents are loaded
  useEffect(() => {
    if (loading || !briefParam || runTarget) return
    const activeAgents = agents.filter(a => a.is_active)
    if (activeAgents.length === 0) return
    setInitialBrief(decodeURIComponent(briefParam))
    // Try to match agent by name if provided
    let targetAgent = activeAgents[0]
    if (agentNameParam) {
      const decodedName = decodeURIComponent(agentNameParam).toLowerCase()
      const match = activeAgents.find(a => a.name.toLowerCase().includes(decodedName))
      if (match) targetAgent = match
    }
    setRunTarget(targetAgent)
    // Clear URL params without page reload
    window.history.replaceState({}, '', '/agents')
  }, [loading, briefParam, agentNameParam, agents]) // eslint-disable-line react-hooks/exhaustive-deps

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
        {isAdmin && (
          <Button size="sm" asChild>
            <Link href="/agents/new">
              <Plus className="h-4 w-4 mr-1.5" /> New Agent
            </Link>
          </Button>
        )}
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isAdmin={isAdmin}
              onRun={() => setRunTarget(agent)}
              onToggleActive={() => void handleToggleActive(agent)}
            />
          ))}
        </div>
      )}

      {/* Run Modal */}
      {runTarget && (
        <RunModal
          agent={runTarget}
          initialInstructions={initialBrief}
          onClose={() => { setRunTarget(null); setInitialBrief('') }}
        />
      )}
    </div>
  )
}

// ─── Agent card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent, isAdmin, onRun, onToggleActive,
}: {
  agent:          Agent
  isAdmin:        boolean
  onRun:          () => void
  onToggleActive: () => void
}) {
  const isDisabled = !agent.is_active

  const modelShort = agent.model === 'gpt-4o' ? 'GPT-4o'
    : agent.model.includes('opus') ? 'Opus 4'
    : 'Sonnet 4'

  return (
    <Card className={cn('transition-colors', isDisabled ? 'opacity-60' : 'hover:border-primary/40')}>
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <AgentAvatar agent={agent} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold truncate">{agent.name}</p>
              {isDisabled && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0 flex items-center gap-0.5">
                  <PowerOff className="h-2.5 w-2.5" /> Disabled
                </Badge>
              )}
            </div>
            {agent.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{agent.description}</p>
            )}
          </div>
          {/* Active/Disabled toggle pill — admins only */}
          {isAdmin && (
            <button
              onClick={onToggleActive}
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
        <div className="flex gap-2 pt-1">
          {!isDisabled && (
            <Button size="sm" className="flex-1" onClick={onRun}>
              <Play className="h-3.5 w-3.5 mr-1.5" /> Run
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" asChild className={cn(isDisabled && 'ml-auto')}>
              <Link href={`/agents/${agent.id}/edit`}>
                <Pencil className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link href={`/agents/${agent.id}/runs`}>
              <Clock className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
