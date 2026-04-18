'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, Loader2, Check, CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Badge }  from '@/components/ui/badge'
import { cn }     from '@/lib/utils'
import { getNextRunTime, formatNextRun } from '@/lib/scheduling'
import type { ScheduleConfig } from '@/lib/scheduling'
import type { Agent, ScheduledRunLog } from '@/lib/types'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STATUS_DOT: Record<string, string> = {
  completed: 'bg-green-500', failed: 'bg-red-500', triggered: 'bg-amber-500', running: 'bg-blue-500',
}

interface Props {
  agentId:   string
  agentName: string
  onClose:   () => void
}

export default function ScheduledRunsPanel({ agentId, agentName, onClose }: Props) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [logs, setLogs]   = useState<ScheduledRunLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [editing, setEditing] = useState(false)

  // Edit form
  const [schedName, setSchedName] = useState('')
  const [taskBrief, setTaskBrief] = useState('')
  const [freq, setFreq]     = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [time, setTime]     = useState('09:00')
  const [dow, setDow]       = useState(1)
  const [dom, setDom]       = useState(1)

  const [groupTimezone, setGroupTimezone] = useState<string>('Australia/Brisbane')

  const load = useCallback(async () => {
    setLoading(true)
    const [aRes, lRes, gRes] = await Promise.all([
      fetch(`/api/agents/${agentId}`),
      fetch(`/api/agents/${agentId}/schedule-logs`),
      fetch('/api/groups/active'),
    ])
    if (gRes.ok) {
      const gJson = await gRes.json() as { data?: { group?: { timezone?: string } } }
      if (gJson.data?.group?.timezone) setGroupTimezone(gJson.data.group.timezone)
    }
    if (aRes.ok) {
      const json = await aRes.json()
      const a = json.data as Agent
      setAgent(a)
      if (a.schedule_config) {
        const sc = a.schedule_config as unknown as ScheduleConfig & { schedule_name?: string; task_brief?: string }
        setSchedName(sc.schedule_name ?? '')
        setTaskBrief(sc.task_brief ?? '')
        setFreq((sc.frequency ?? 'daily') as 'daily' | 'weekly' | 'monthly')
        setTime(sc.time ?? '09:00')
        setDow(sc.day_of_week ?? 1)
        setDom(sc.day_of_month ?? 1)
      }
    }
    if (lRes.ok) {
      const json = await lRes.json()
      setLogs(json.data ?? [])
    }
    setLoading(false)
  }, [agentId])

  useEffect(() => { void load() }, [load])

  async function toggleEnabled() {
    if (!agent) return
    setSaving(true)
    const next = !agent.schedule_enabled
    await fetch(`/api/agents/${agentId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_enabled: next }),
    })
    setAgent(prev => prev ? { ...prev, schedule_enabled: next } : prev)
    setSaving(false)
  }

  async function saveSchedule() {
    setSaving(true)
    const config = {
      schedule_name: schedName.trim() || `${agentName} — ${freq}`,
      task_brief: taskBrief.trim(),
      frequency: freq, time, day_of_week: dow, day_of_month: dom, timezone: groupTimezone,
    } as unknown as ScheduleConfig
    const nextRun = getNextRunTime(config, new Date(), groupTimezone)
    await fetch(`/api/agents/${agentId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schedule_config: config,
        schedule_enabled: true,
        next_scheduled_run_at: nextRun.toISOString(),
      }),
    })
    setAgent(prev => prev ? {
      ...prev,
      schedule_config: config as unknown as Agent['schedule_config'],
      schedule_enabled: true,
      next_scheduled_run_at: nextRun.toISOString(),
    } : prev)
    setEditing(false)
    setSaving(false)
  }

  const sc = agent?.schedule_config as unknown as ScheduleConfig | null
  const nextRunStr = sc ? formatNextRun(getNextRunTime(sc, new Date(), groupTimezone), groupTimezone) : null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border-l shadow-xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold text-sm">Scheduled Runs</h2>
              <p className="text-xs text-muted-foreground">{agentName}</p>
            </div>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Current Schedule */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Schedule</h3>
                {sc ? (
                  <div className="rounded-lg border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {sc.frequency === 'daily' ? 'Daily' : sc.frequency === 'weekly' ? `Weekly on ${DAYS[sc.day_of_week ?? 1]}` : `Monthly on day ${sc.day_of_month ?? 1}`}
                          {' at '}{sc.time}
                        </p>
                        {nextRunStr && <p className="text-xs text-muted-foreground mt-0.5">Next: {nextRunStr}</p>}
                      </div>
                      <Badge className={cn('text-[10px]', agent?.schedule_enabled ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground')}>
                        {agent?.schedule_enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => setEditing(true)}>Edit</Button>
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => void toggleEnabled()} disabled={saving}>
                        {agent?.schedule_enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center">
                    <p className="text-sm text-muted-foreground">No schedule configured</p>
                    <Button size="sm" className="mt-2" onClick={() => setEditing(true)}>+ Add Schedule</Button>
                  </div>
                )}
              </div>

              {/* Edit form */}
              {editing && (
                <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                  <div>
                    <Label className="text-xs">Schedule Name</Label>
                    <Input value={schedName} onChange={e => setSchedName(e.target.value)} placeholder="Weekly Board Report" className="text-sm h-8" />
                  </div>
                  <div>
                    <Label className="text-xs">Task Brief</Label>
                    <textarea value={taskBrief} onChange={e => setTaskBrief(e.target.value)} rows={3} placeholder="What should the agent do each run…"
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Frequency</Label>
                      <select value={freq} onChange={e => setFreq(e.target.value as typeof freq)}
                        className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Time</Label>
                      <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="h-8 text-sm" />
                    </div>
                  </div>
                  {freq === 'weekly' && (
                    <div>
                      <Label className="text-xs">Day of week</Label>
                      <select value={dow} onChange={e => setDow(Number(e.target.value))}
                        className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                        {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                  )}
                  {freq === 'monthly' && (
                    <div>
                      <Label className="text-xs">Day of month</Label>
                      <Input type="number" min={1} max={28} value={dom} onChange={e => setDom(Number(e.target.value))} className="h-8 text-sm" />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Next: {formatNextRun(
                      getNextRunTime({ frequency: freq, time, day_of_week: dow, day_of_month: dom, timezone: groupTimezone }, new Date(), groupTimezone),
                      groupTimezone,
                    )}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void saveSchedule()} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              {/* Run History */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Run History</h3>
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No scheduled runs yet.</p>
                ) : (
                  <div className="divide-y divide-border rounded-md border overflow-hidden">
                    {logs.map(log => (
                      <div key={log.id} className="flex items-center gap-3 px-3 py-2.5 bg-background">
                        <span className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[log.status] ?? 'bg-gray-400')} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground">
                            {new Date(log.triggered_at ?? log.created_at).toLocaleDateString('en-AU', {
                              weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                          <p className="text-[10px] text-muted-foreground capitalize">{log.status}</p>
                        </div>
                        {log.run_id && (
                          <Link href={`/agents/runs/${log.run_id}`} className="text-xs text-primary hover:underline shrink-0">
                            View run
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
