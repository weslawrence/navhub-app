'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Calendar, Sparkles, KeyRound, Loader2,
  Check, Clock, Eye, EyeOff, Trash2, Plus, Shield,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button }    from '@/components/ui/button'
import { Input }     from '@/components/ui/input'
import { Label }     from '@/components/ui/label'
import { Badge }     from '@/components/ui/badge'
import { cn }        from '@/lib/utils'
import type { Agent, AgentCredential } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'Schedule' | 'Personality' | 'API Keys'

interface ScheduleConfig {
  frequency:  'daily' | 'weekly' | 'monthly'
  time:       string   // HH:MM
  day_of_week?: number  // 0=Sun … 6=Sat (weekly only)
  day_of_month?: number // 1–31 (monthly only)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

const COMMUNICATION_STYLE_OPTIONS = [
  { value: 'formal',   label: 'Formal',   description: 'Professional, precise language for executive audiences' },
  { value: 'balanced', label: 'Balanced',  description: 'Clear and professional without being stiff' },
  { value: 'casual',   label: 'Casual',    description: 'Friendly, conversational tone' },
]

const RESPONSE_LENGTH_OPTIONS = [
  { value: 'concise',  label: 'Concise',  description: 'Brief and to the point — key facts only' },
  { value: 'balanced', label: 'Balanced', description: 'Full context without unnecessary padding' },
  { value: 'detailed', label: 'Detailed', description: 'Thorough explanations with full context' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const agentId = params.id

  const [agent,       setAgent]       = useState<Agent | null>(null)
  const [credentials, setCredentials] = useState<AgentCredential[]>([])
  const [loading,     setLoading]     = useState(true)
  const [tab,         setTab]         = useState<Tab>('Schedule')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleConfig,  setScheduleConfig]  = useState<ScheduleConfig>({
    frequency:    'weekly',
    time:         '09:00',
    day_of_week:  1, // Monday
    day_of_month: 1,
  })

  // Personality state
  const [commStyle,     setCommStyle]     = useState<'formal' | 'balanced' | 'casual'>('balanced')
  const [respLength,    setRespLength]    = useState<'concise' | 'balanced' | 'detailed'>('balanced')

  // API Keys state
  const [anthropicKey,  setAnthropicKey]  = useState('')
  const [showKey,       setShowKey]       = useState(false)
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false)
  const [anthropicCredId, setAnthropicCredId] = useState<string | null>(null)
  const [keyLoading,    setKeyLoading]    = useState(false)

  // ── Load agent + credentials ───────────────────────────────────────────────

  const loadAgent = useCallback(async () => {
    setLoading(true)
    try {
      const [agentRes, credsRes] = await Promise.all([
        fetch(`/api/agents/${agentId}`),
        fetch(`/api/agents/${agentId}/credentials`),
      ])
      if (!agentRes.ok) { router.push('/agents'); return }
      const agentData = (await agentRes.json()) as { data: Agent }
      const a = agentData.data
      setAgent(a)

      // Hydrate schedule state
      setScheduleEnabled(a.schedule_enabled ?? false)
      if (a.schedule_config) {
        setScheduleConfig(a.schedule_config as unknown as ScheduleConfig)
      }
      // Hydrate personality state
      setCommStyle((a.communication_style as 'formal' | 'balanced' | 'casual') ?? 'balanced')
      setRespLength((a.response_length as 'concise' | 'balanced' | 'detailed') ?? 'balanced')

      // Credentials
      if (credsRes.ok) {
        const credsData = (await credsRes.json()) as { data: AgentCredential[] }
        const creds = credsData.data ?? []
        setCredentials(creds)
        const anthCred = creds.find(c => c.key === 'anthropic_api_key')
        setHasAnthropicKey(!!anthCred)
        setAnthropicCredId(anthCred?.id ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [agentId, router])

  useEffect(() => { loadAgent() }, [loadAgent])

  // ── Save helpers ──────────────────────────────────────────────────────────

  async function patchAgent(updates: Record<string, unknown>) {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(updates),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? 'Save failed')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Schedule save ─────────────────────────────────────────────────────────

  async function saveSchedule() {
    await patchAgent({
      schedule_enabled: scheduleEnabled,
      schedule_config:  scheduleEnabled ? scheduleConfig : null,
    })
  }

  // ── Personality save ──────────────────────────────────────────────────────

  async function savePersonality() {
    await patchAgent({
      communication_style: commStyle,
      response_length:     respLength,
    })
  }

  // ── API Key operations ────────────────────────────────────────────────────

  async function saveAnthropicKey() {
    if (!anthropicKey.trim()) return
    setKeyLoading(true)
    setError(null)
    try {
      if (hasAnthropicKey && anthropicCredId) {
        // Update existing
        const res = await fetch(`/api/agents/${agentId}/credentials/${anthropicCredId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ value: anthropicKey }),
        })
        if (!res.ok) throw new Error('Failed to update key')
      } else {
        // Create new
        const res = await fetch(`/api/agents/${agentId}/credentials`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            name:  'Anthropic API Key',
            key:   'anthropic_api_key',
            value: anthropicKey,
          }),
        })
        if (!res.ok) throw new Error('Failed to save key')
        const j = (await res.json()) as { data: AgentCredential }
        setAnthropicCredId(j.data.id)
      }
      setHasAnthropicKey(true)
      setAnthropicKey('')
      setShowKey(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key')
    } finally {
      setKeyLoading(false)
    }
  }

  async function removeAnthropicKey() {
    if (!anthropicCredId) return
    setKeyLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/agents/${agentId}/credentials/${anthropicCredId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to remove key')
      setHasAnthropicKey(false)
      setAnthropicCredId(null)
      setAnthropicKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove key')
    } finally {
      setKeyLoading(false)
    }
  }

  // ── Next run preview ──────────────────────────────────────────────────────

  function nextRunPreview(): string {
    if (!scheduleEnabled) return 'Schedule disabled'
    const [h, m] = scheduleConfig.time.split(':').map(Number)
    const next = new Date()
    next.setHours(h, m, 0, 0)
    if (scheduleConfig.frequency === 'daily') {
      if (next <= new Date()) next.setDate(next.getDate() + 1)
      return `Daily at ${scheduleConfig.time} — next: ${next.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}`
    }
    if (scheduleConfig.frequency === 'weekly') {
      const target = scheduleConfig.day_of_week ?? 1
      const cur = next.getDay()
      const diff = (target - cur + 7) % 7 || 7
      next.setDate(next.getDate() + diff)
      return `Weekly on ${DAYS_OF_WEEK[target]} at ${scheduleConfig.time} — next: ${next.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}`
    }
    if (scheduleConfig.frequency === 'monthly') {
      const day = scheduleConfig.day_of_month ?? 1
      next.setDate(day)
      if (next <= new Date()) {
        next.setMonth(next.getMonth() + 1)
        next.setDate(day)
      }
      return `Monthly on day ${day} at ${scheduleConfig.time} — next: ${next.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return ''
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!agent) return null

  // ── Render ─────────────────────────────────────────────────────────────────

  const TABS: { id: Tab; icon: React.ElementType; label: string }[] = [
    { id: 'Schedule',   icon: Calendar,  label: 'Schedule'   },
    { id: 'Personality', icon: Sparkles, label: 'Personality' },
    { id: 'API Keys',   icon: KeyRound,  label: 'API Keys'   },
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/agents"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div
          className="h-8 w-8 rounded-full shrink-0"
          style={{ backgroundColor: agent.avatar_color }}
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-foreground truncate">{agent.name}</h1>
          <p className="text-xs text-muted-foreground">{agent.description ?? agent.model}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/agents/${agentId}/edit`}>
            <Button variant="outline" size="sm">Edit</Button>
          </Link>
          <Link href={`/agents/${agentId}/runs`}>
            <Button variant="outline" size="sm">Run History</Button>
          </Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(null) }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Schedule tab ─────────────────────────────────────────────────── */}
      {tab === 'Schedule' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule</CardTitle>
            <CardDescription>
              Run this agent automatically on a recurring schedule. Scheduled runs use the same
              configuration as manual runs — no additional setup required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Run on a schedule</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically trigger this agent at the configured time
                </p>
              </div>
              <button
                role="switch"
                aria-checked={scheduleEnabled}
                onClick={() => setScheduleEnabled(e => !e)}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                  scheduleEnabled ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform',
                  scheduleEnabled ? 'translate-x-5' : 'translate-x-0'
                )} />
              </button>
            </div>

            {scheduleEnabled && (
              <div className="space-y-4 pt-2 border-t border-border">

                {/* Frequency */}
                <div className="space-y-1.5">
                  <Label>Frequency</Label>
                  <div className="flex gap-2">
                    {(['daily', 'weekly', 'monthly'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setScheduleConfig(c => ({ ...c, frequency: f }))}
                        className={cn(
                          'flex-1 px-3 py-2 text-sm rounded-md border transition-colors capitalize',
                          scheduleConfig.frequency === f
                            ? 'border-primary bg-primary/10 text-primary font-medium'
                            : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time */}
                <div className="space-y-1.5">
                  <Label htmlFor="sched-time">Time (your local time)</Label>
                  <Input
                    id="sched-time"
                    type="time"
                    value={scheduleConfig.time}
                    onChange={e => setScheduleConfig(c => ({ ...c, time: e.target.value }))}
                    className="w-36"
                  />
                </div>

                {/* Day of week (weekly) */}
                {scheduleConfig.frequency === 'weekly' && (
                  <div className="space-y-1.5">
                    <Label>Day of week</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS_OF_WEEK.map((day, i) => (
                        <button
                          key={day}
                          onClick={() => setScheduleConfig(c => ({ ...c, day_of_week: i }))}
                          className={cn(
                            'px-3 py-1.5 text-xs rounded-md border transition-colors',
                            scheduleConfig.day_of_week === i
                              ? 'border-primary bg-primary/10 text-primary font-medium'
                              : 'border-border text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {day.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Day of month (monthly) */}
                {scheduleConfig.frequency === 'monthly' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="sched-dom">Day of month</Label>
                    <Input
                      id="sched-dom"
                      type="number"
                      min={1}
                      max={28}
                      value={scheduleConfig.day_of_month ?? 1}
                      onChange={e => setScheduleConfig(c => ({
                        ...c, day_of_month: Math.min(28, Math.max(1, parseInt(e.target.value) || 1))
                      }))}
                      className="w-24"
                    />
                    <p className="text-xs text-muted-foreground">Max 28 to avoid month-end issues</p>
                  </div>
                )}

                {/* Preview */}
                <div className="rounded-md bg-muted/50 border border-border px-4 py-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="text-sm text-foreground">{nextRunPreview()}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={saveSchedule} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                {saved ? 'Saved' : 'Save Schedule'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Personality tab ──────────────────────────────────────────────── */}
      {tab === 'Personality' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Communication Style</CardTitle>
              <CardDescription>
                How the agent should phrase its responses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {COMMUNICATION_STYLE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCommStyle(opt.value as typeof commStyle)}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-lg border transition-colors',
                    commStyle === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-foreground/30'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    {commStyle === opt.value && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Response Length</CardTitle>
              <CardDescription>
                How much detail the agent includes in its output.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {RESPONSE_LENGTH_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRespLength(opt.value as typeof respLength)}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-lg border transition-colors',
                    respLength === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-foreground/30'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    {respLength === opt.value && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Preview */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Style preview</p>
              <p className="text-sm text-foreground">
                {commStyle === 'formal' && respLength === 'concise' &&
                  'Revenue declined 12% QoQ to $2.1M. Primary driver: reduced enterprise contract renewals. Recommend: accelerate renewal pipeline.'}
                {commStyle === 'formal' && respLength === 'balanced' &&
                  'Revenue for the quarter was $2.1M, representing a 12% decline quarter-on-quarter. This contraction was primarily driven by reduced enterprise contract renewals. The following actions are recommended to address this trend.'}
                {commStyle === 'formal' && respLength === 'detailed' &&
                  'The financial data for Q3 FY2026 indicates a revenue figure of $2.1M, which represents a 12% contraction relative to the preceding quarter. This decline is attributable to a combination of factors including reduced enterprise contract renewal rates and increased competitive pressure in the mid-market segment.'}
                {commStyle === 'balanced' && respLength === 'concise' &&
                  'Revenue was $2.1M this quarter — down 12% from last quarter. The main issue is fewer enterprise renewals. Worth reviewing the pipeline.'}
                {commStyle === 'balanced' && respLength === 'balanced' &&
                  'Revenue came in at $2.1M this quarter, which is 12% below the prior quarter. The primary driver was a slowdown in enterprise contract renewals. I\'d recommend reviewing the renewal pipeline and identifying at-risk accounts.'}
                {commStyle === 'balanced' && respLength === 'detailed' &&
                  'Looking at the Q3 FY2026 figures, revenue landed at $2.1M — a 12% dip from Q2. The main culprit is a slowdown in enterprise contract renewals, which historically drive about 60% of quarterly revenue. There\'s also been some competitive pressure in the mid-market space, which is worth keeping an eye on.'}
                {commStyle === 'casual' && respLength === 'concise' &&
                  'Revenue hit $2.1M this quarter — ouch, that\'s down 12%. Looks like enterprise renewals are the main issue.'}
                {commStyle === 'casual' && respLength === 'balanced' &&
                  'So revenue came in at $2.1M this quarter, which is about 12% down from last quarter. The big culprit here is enterprise renewals slowing down. Might be worth taking a closer look at what\'s going on there.'}
                {commStyle === 'casual' && respLength === 'detailed' &&
                  'Alright, so Q3 numbers are in and revenue landed at $2.1M — that\'s a 12% drop from last quarter, which isn\'t ideal. The main thing driving this seems to be enterprise contract renewals coming in slower than usual. There\'s also a bit of competitive pressure in mid-market that might be playing a role. Probably worth digging into the renewal pipeline to see what\'s at risk.'}
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={savePersonality} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
              {saved ? 'Saved' : 'Save Personality'}
            </Button>
          </div>
        </div>
      )}

      {/* ── API Keys tab ─────────────────────────────────────────────────── */}
      {tab === 'API Keys' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Anthropic API Key</CardTitle>
              <CardDescription>
                Connect your own Anthropic API key to use your own quota and billing instead of
                NavHub&apos;s shared allocation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Status badge */}
              {hasAnthropicKey ? (
                <div className="flex items-center justify-between rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-300">Using your Anthropic key</p>
                      <p className="text-xs text-green-600 dark:text-green-400">Runs are billed to your Anthropic account</p>
                    </div>
                  </div>
                  <Badge className="bg-green-600 text-white hover:bg-green-600">Active</Badge>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 border border-border px-4 py-3">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Using NavHub shared allocation</p>
                </div>
              )}

              {/* Key input */}
              <div className="space-y-1.5">
                <Label htmlFor="anthropic-key">
                  {hasAnthropicKey ? 'Update API key' : 'Anthropic API key'}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="anthropic-key"
                      type={showKey ? 'text' : 'password'}
                      value={anthropicKey}
                      onChange={e => setAnthropicKey(e.target.value)}
                      placeholder={hasAnthropicKey ? 'sk-ant-… (leave blank to keep current)' : 'sk-ant-…'}
                      className="pr-10 font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    onClick={saveAnthropicKey}
                    disabled={keyLoading || !anthropicKey.trim()}
                    className="gap-2 shrink-0"
                  >
                    {keyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {hasAnthropicKey ? 'Update' : 'Connect'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Get your key at{' '}
                  <a
                    href="https://console.anthropic.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    console.anthropic.com
                  </a>
                  . The key is stored encrypted in the NavHub credential vault.
                </p>
              </div>

              {/* Remove */}
              {hasAnthropicKey && (
                <div className="border-t border-border pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Remove API key</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Reverts to NavHub&apos;s shared allocation.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={removeAnthropicKey}
                      disabled={keyLoading}
                      className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30 gap-2 shrink-0"
                    >
                      {keyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Other credentials overview */}
          {credentials.filter(c => c.key !== 'anthropic_api_key').length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Other Credentials</CardTitle>
                <CardDescription>
                  Additional credentials stored for this agent. Manage these from the{' '}
                  <Link href={`/agents/${agentId}/edit`} className="text-primary hover:underline">
                    Edit page
                  </Link>
                  .
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  {credentials.filter(c => c.key !== 'anthropic_api_key').map(cred => (
                    <div key={cred.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium text-foreground">{cred.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{cred.key}</p>
                      </div>
                      <Badge variant="outline">Stored</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
