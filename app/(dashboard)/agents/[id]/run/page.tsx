'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Play, Loader2, CalendarClock, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { cn }     from '@/lib/utils'
import type { Agent, Company } from '@/lib/types'
import { getNextRunTime, formatNextRun } from '@/lib/scheduling'
import type { ScheduleConfig } from '@/lib/scheduling'
import { AVATAR_PRESET_MAP } from '@/lib/agent-presets'

function getLastNMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

function AgentAvatar({ agent }: { agent: Agent }) {
  if (agent.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={agent.avatar_url} alt={agent.name} className="rounded-full object-cover shrink-0 h-10 w-10" />
    )
  }
  if (agent.avatar_preset && AVATAR_PRESET_MAP[agent.avatar_preset]) {
    return (
      <div
        className="rounded-full flex items-center justify-center shrink-0 h-10 w-10 text-xl"
        style={{ backgroundColor: agent.avatar_color + '20' }}
      >
        {AVATAR_PRESET_MAP[agent.avatar_preset]}
      </div>
    )
  }
  const initials = agent.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold text-white shrink-0 h-10 w-10 text-sm"
      style={{ backgroundColor: agent.avatar_color }}
    >
      {initials}
    </div>
  )
}

export default function AgentRunPage() {
  const params       = useParams<{ id: string }>()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const agentId      = params.id

  const [agent,     setAgent]     = useState<Agent | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])
  const [folders,   setFolders]   = useState<Array<{ id: string; name: string }>>([])

  // Form state (pre-populated from query params where supplied)
  const [runName,        setRunName]        = useState(searchParams.get('name') ?? '')
  const [extraBrief,     setExtraBrief]     = useState(searchParams.get('brief') ?? '')
  const [includePeriod,  setIncludePeriod]  = useState(false)
  const periodOptions = useMemo(() => getLastNMonths(12), [])
  const [period,         setPeriod]         = useState(periodOptions[0])
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([])

  // Output settings
  const [outputType,   setOutputType]   = useState<'document' | 'report' | ''>('')
  const [outputFolderId, setOutputFolderId] = useState('')
  const [outputName,   setOutputName]   = useState('')
  const [outputStatus, setOutputStatus] = useState<'draft' | 'published'>('draft')

  // Notifications
  const [notifyEmailOn, setNotifyEmailOn] = useState(false)
  const [notifySlackOn, setNotifySlackOn] = useState(false)
  const [notifyEmail,   setNotifyEmail]   = useState('')
  const [notifySlack,   setNotifySlack]   = useState('')

  // Recurring
  const [isRecurring, setIsRecurring] = useState(false)
  const [schedFreq,   setSchedFreq]   = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [schedTime,   setSchedTime]   = useState('09:00')
  const [schedDow,    setSchedDow]    = useState(1)
  const [schedDom,    setSchedDom]    = useState(1)

  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Group timezone (from /api/groups/active)
  const [groupTimezone, setGroupTimezone] = useState<string>('Australia/Brisbane')

  // ── Load agent + helpers ──
  const loadAgent = useCallback(async () => {
    setLoading(true)
    try {
      const [agRes, coRes, grRes] = await Promise.all([
        fetch(`/api/agents/${agentId}`),
        fetch('/api/companies'),
        fetch('/api/groups/active'),
      ])
      if (!agRes.ok) { router.push('/agents'); return }
      const agJson = await agRes.json() as { data: Agent }
      const coJson = await coRes.json() as { data: Array<Company & { is_active?: boolean }> }
      const grJson = await grRes.json() as { data?: { group?: { timezone?: string } } }
      setAgent(agJson.data)
      setCompanies((coJson.data ?? []).filter(c => (c as { is_active?: boolean }).is_active !== false))
      if (grJson.data?.group?.timezone) setGroupTimezone(grJson.data.group.timezone)
      // Pre-populate notifications from agent defaults
      const a = agJson.data as unknown as { notify_email?: string | null; notify_slack_channel?: string | null }
      if (a.notify_email)         setNotifyEmail(a.notify_email)
      if (a.notify_slack_channel) setNotifySlack(a.notify_slack_channel)
    } finally {
      setLoading(false)
    }
  }, [agentId, router])

  useEffect(() => { void loadAgent() }, [loadAgent])

  // Load folders for output picker (fetch depending on type)
  useEffect(() => {
    if (!outputType) { setFolders([]); return }
    const url = outputType === 'document'
      ? '/api/documents/folders'
      : '/api/reports/custom/folders'
    fetch(url)
      .then(r => r.json())
      .then((j: { data?: Array<{ id: string; name: string }> }) => setFolders(j.data ?? []))
      .catch(() => setFolders([]))
  }, [outputType])

  // Next-run preview for recurring section
  const nextRunDisplay = useMemo(() => {
    if (!isRecurring) return null
    try {
      const cfg: ScheduleConfig = {
        frequency:    schedFreq,
        time:         schedTime,
        day_of_week:  schedDow,
        day_of_month: schedDom,
        timezone:     groupTimezone,
      }
      return formatNextRun(getNextRunTime(cfg, new Date(), groupTimezone), groupTimezone)
    } catch { return null }
  }, [isRecurring, schedFreq, schedTime, schedDow, schedDom, groupTimezone])

  // ── Launch ──
  async function handleRun() {
    setSubmitting(true)
    setError(null)
    try {
      // If recurring, persist schedule on the agent first
      if (isRecurring && agent) {
        try {
          const cfg: ScheduleConfig = {
            frequency:    schedFreq,
            time:         schedTime,
            day_of_week:  schedDow,
            day_of_month: schedDom,
            timezone:     groupTimezone,
          }
          await fetch(`/api/agents/${agentId}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              schedule_enabled:      true,
              schedule_config:       cfg,
              next_scheduled_run_at: getNextRunTime(cfg, new Date(), groupTimezone).toISOString(),
            }),
          })
        } catch { /* non-fatal */ }
      }

      const res = await fetch(`/api/agents/${agentId}/run`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...(includePeriod ? { period } : {}),
          company_ids:          selectedCompanyIds.length > 0 ? selectedCompanyIds : undefined,
          extra_instructions:   extraBrief.trim() || undefined,
          run_name:             runName.trim() || undefined,
          output_type:          outputType || undefined,
          output_folder_id:     outputFolderId || undefined,
          output_status:        outputStatus,
          output_name_override: outputName.trim() || undefined,
          notify_email:         notifyEmailOn && notifyEmail.trim() ? notifyEmail.trim() : null,
          notify_slack_channel: notifySlackOn && notifySlack.trim() ? notifySlack.trim() : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to start run')
      router.push(`/agents/runs/${json.data.run_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!agent) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/agents" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <AgentAvatar agent={agent} />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-foreground truncate">Run {agent.name}</h1>
          <p className="text-xs text-muted-foreground truncate">{agent.description ?? agent.model}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Run name + Brief */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="run-name">Run name <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="run-name"
              value={runName}
              onChange={e => setRunName(e.target.value)}
              placeholder="e.g. Q1 Board Report"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brief">Brief</Label>
            <textarea
              id="brief"
              value={extraBrief}
              onChange={e => setExtraBrief(e.target.value)}
              rows={5}
              placeholder="Describe what you want this run to do…"
              className="w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </CardContent>
      </Card>

      {/* Period + Company scope */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includePeriod}
              onChange={e => setIncludePeriod(e.target.checked)}
              className="rounded border-input"
            />
            <span>Include a reporting period for this run</span>
          </label>
          {includePeriod && (
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {periodOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}

          {companies.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t">
              <Label className="text-xs">Company scope <span className="font-normal text-muted-foreground">(optional — leave empty for all)</span></Label>
              <div className="flex flex-wrap gap-1.5">
                {companies.map(c => {
                  const active = selectedCompanyIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCompanyIds(prev =>
                        prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]
                      )}
                      className={cn(
                        'text-xs rounded-full border px-3 py-1 transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Output settings */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Output settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Save as</label>
              <select
                value={outputType}
                onChange={e => {
                  setOutputType(e.target.value as 'document' | 'report' | '')
                  setOutputFolderId('')
                }}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Auto (agent decides)</option>
                <option value="document">Document</option>
                <option value="report">Report</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Status</label>
              <select
                value={outputStatus}
                onChange={e => setOutputStatus(e.target.value as 'draft' | 'published')}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Folder</label>
              <select
                value={outputFolderId}
                onChange={e => setOutputFolderId(e.target.value)}
                disabled={!outputType || folders.length === 0}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
              >
                <option value="">{outputType ? 'Default' : 'Choose output type first'}</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Name override</label>
              <Input
                value={outputName}
                onChange={e => setOutputName(e.target.value)}
                placeholder="Auto-generated if blank"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Notify on completion <span className="text-muted-foreground font-normal">(optional)</span></h2>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notifyEmailOn}
              onChange={e => setNotifyEmailOn(e.target.checked)}
              className="rounded border-input"
            />
            <span className="text-xs text-muted-foreground w-14">Email</span>
            <Input
              value={notifyEmail}
              onChange={e => setNotifyEmail(e.target.value)}
              placeholder="recipient@company.com"
              disabled={!notifyEmailOn}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notifySlackOn}
              onChange={e => setNotifySlackOn(e.target.checked)}
              className="rounded border-input"
            />
            <span className="text-xs text-muted-foreground w-14">Slack</span>
            <Input
              value={notifySlack}
              onChange={e => setNotifySlack(e.target.value)}
              placeholder="#channel"
              disabled={!notifySlackOn}
              className="flex-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Recurring */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={e => setIsRecurring(e.target.checked)}
              className="rounded border-input"
            />
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span>Make this recurring</span>
          </label>

          {isRecurring && (
            <div className="space-y-3 pl-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Frequency</label>
                  <select
                    value={schedFreq}
                    onChange={e => setSchedFreq(e.target.value as 'daily' | 'weekly' | 'monthly')}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Time</label>
                  <Input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} />
                </div>
                {schedFreq === 'weekly' && (
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground block mb-1">Day of week</label>
                    <select
                      value={schedDow}
                      onChange={e => setSchedDow(parseInt(e.target.value))}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                        <option key={d} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
                {schedFreq === 'monthly' && (
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground block mb-1">Day of month (1-28)</label>
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      value={schedDom}
                      onChange={e => setSchedDom(Math.min(28, Math.max(1, parseInt(e.target.value) || 1)))}
                    />
                  </div>
                )}
              </div>
              {nextRunDisplay && (
                <p className="text-xs text-muted-foreground">
                  Next run: <span className="text-foreground font-medium">{nextRunDisplay}</span>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.push('/agents')} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={() => void handleRun()} disabled={submitting} className="gap-2">
          {submitting
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</>
            : isRecurring
              ? <><Check className="h-4 w-4" /> Schedule &amp; Run →</>
              : <><Play   className="h-4 w-4" /> Run Agent →</>}
        </Button>
      </div>
    </div>
  )
}
