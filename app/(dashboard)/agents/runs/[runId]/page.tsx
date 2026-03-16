'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, XCircle, Loader2, Clock, Copy, Check,
  Play, ChevronDown, ChevronRight, FileText, AlertCircle, ExternalLink, Library,
  Ban,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge }  from '@/components/ui/badge'
import { cn }     from '@/lib/utils'
import CollapsibleSection from '@/components/ui/CollapsibleSection'
import type { Agent, AgentRun, RunStatus } from '@/lib/types'
import type { RunEvent } from '@/lib/agent-runner'

// ─── Tool display maps ─────────────────────────────────────────────────────────

const TOOL_EMOJI: Record<string, string> = {
  read_financials:        '📊',
  read_companies:         '🏢',
  generate_report:        '📄',
  send_slack:             '💬',
  send_email:             '📧',
  list_report_templates:  '📋',
  read_report_template:   '🔍',
  create_report_template: '✨',
  update_report_template: '✏️',
  render_report:          '🖨️',
  analyse_document:       '🔬',
  list_documents:         '📂',
  read_document:          '📖',
  create_document:        '📝',
  update_document:        '✍️',
}

const TOOL_LABEL: Record<string, string> = {
  read_financials:        'Read Financials',
  read_companies:         'Read Companies',
  generate_report:        'Generate Report',
  send_slack:             'Send Slack',
  send_email:             'Send Email',
  list_report_templates:  'List Templates',
  read_report_template:   'Read Template',
  create_report_template: 'Create Template',
  update_report_template: 'Update Template',
  render_report:          'Render Report',
  analyse_document:       'Analyse Document',
  list_documents:         'List Documents',
  read_document:          'Read Document',
  create_document:        'Create Document',
  update_document:        'Update Document',
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<RunStatus, { label: string; badgeClass: string }> = {
  queued:    { label: 'Queued',    badgeClass: 'bg-muted text-muted-foreground' },
  running:   { label: 'Running',   badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  success:   { label: 'Complete',  badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  error:     { label: 'Error',     badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  cancelled: { label: 'Cancelled', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
}

// ─── Tool result summariser ────────────────────────────────────────────────────

function summariseTool(tool: string, output: string): string {
  try {
    const parsed = JSON.parse(output) as { success?: boolean; error?: string; data?: unknown }
    if (!parsed.success) return parsed.error ?? 'Failed'
    const data = parsed.data

    switch (tool) {
      case 'list_report_templates': {
        const n = Array.isArray(data) ? data.length : 0
        return `Found ${n} template${n !== 1 ? 's' : ''}`
      }
      case 'read_report_template': {
        const d = data as { name?: string; slots?: unknown[] }
        return `${d?.name ?? 'Template'} — ${d?.slots?.length ?? 0} slots`
      }
      case 'create_report_template': {
        const d = data as { name?: string }
        return `Created: ${d?.name ?? 'template'}`
      }
      case 'update_report_template': {
        const d = data as { name?: string }
        return `Updated: ${d?.name ?? 'template'}`
      }
      case 'render_report': {
        const d = data as { report_name?: string }
        return `Rendered: ${d?.report_name ?? 'report'}`
      }
      case 'generate_report': {
        const d = data as { report_name?: string }
        return `Saved: ${d?.report_name ?? 'report'}`
      }
      case 'list_documents': {
        const n = Array.isArray(data) ? data.length : 0
        return `Found ${n} document${n !== 1 ? 's' : ''}`
      }
      case 'read_document': {
        const d = data as { title?: string }
        return `Read: ${d?.title ?? 'document'}`
      }
      case 'create_document': {
        const d = data as { title?: string }
        return `Created: ${d?.title ?? 'document'}`
      }
      case 'update_document': {
        const d = data as { title?: string }
        return `Updated: ${d?.title ?? 'document'}`
      }
      case 'read_financials':
        return 'Financial data loaded'
      case 'read_companies': {
        const n = Array.isArray(data) ? data.length : 0
        return `Found ${n} compan${n !== 1 ? 'ies' : 'y'}`
      }
      case 'send_email':
        return 'Email sent'
      case 'send_slack':
        return 'Slack message sent'
      case 'analyse_document':
        return 'Analysis complete'
      default:
        return 'Done'
    }
  } catch {
    return output.length > 60 ? output.slice(0, 57) + '…' : output
  }
}

// ─── Tool event type ───────────────────────────────────────────────────────────

interface ToolEventEntry {
  tool:           string
  input?:         Record<string, unknown>
  output?:        string
  inProgress:     boolean
  resultSummary?: string
}

// ─── Basic markdown renderer ───────────────────────────────────────────────────

function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <div className="space-y-1 font-mono text-sm leading-relaxed whitespace-pre-wrap">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <p key={i} className="font-semibold text-base mt-3">{line.slice(4)}</p>
        if (line.startsWith('## '))  return <p key={i} className="font-bold text-lg mt-4">{line.slice(3)}</p>
        if (line.startsWith('# '))   return <p key={i} className="font-bold text-xl mt-4">{line.slice(2)}</p>
        if (line.startsWith('• ') || line.startsWith('- ')) return <p key={i} className="ml-4">{line}</p>
        if (line.startsWith('  ')) return <p key={i} className="ml-6 text-muted-foreground">{line}</p>
        return <p key={i}>{line || '\u00A0'}</p>
      })}
    </div>
  )
}

// ─── Timeline entry ────────────────────────────────────────────────────────────

function TimelineEntry({ entry }: { entry: ToolEventEntry }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const emoji = TOOL_EMOJI[entry.tool] ?? '🔧'
  const label = TOOL_LABEL[entry.tool] ?? entry.tool.replace(/_/g, ' ')

  return (
    <div className="flex items-start gap-2.5">
      <div className="shrink-0 w-4 mt-[3px]">
        {entry.inProgress
          ? <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
          : <CheckCircle2 className="h-4 w-4 text-green-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm">
          <span>{emoji}</span>
          <span className={cn('font-medium', entry.inProgress && 'text-blue-600 dark:text-blue-400')}>
            {label}
          </span>
          {entry.inProgress && (
            <span className="text-xs text-muted-foreground animate-pulse">running…</span>
          )}
        </div>
        {!entry.inProgress && entry.resultSummary && (
          <p className="text-xs text-muted-foreground mt-0.5 ml-0.5">→ {entry.resultSummary}</p>
        )}
        {!entry.inProgress && (entry.input !== undefined || entry.output !== undefined) && (
          <button
            onClick={() => setDetailsOpen(d => !d)}
            className="flex items-center gap-0.5 text-xs text-muted-foreground/60 hover:text-muted-foreground mt-1 transition-colors"
          >
            {detailsOpen
              ? <ChevronDown  className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />}
            Details
          </button>
        )}
        {detailsOpen && (
          <div className="mt-2 space-y-2 text-[11px] font-mono">
            {entry.input && Object.keys(entry.input).length > 0 && (
              <div>
                <p className="text-muted-foreground font-sans font-medium text-[10px] mb-1 uppercase tracking-wide">Input</p>
                <pre className="bg-muted/40 p-2 rounded overflow-x-auto">{JSON.stringify(entry.input, null, 2)}</pre>
              </div>
            )}
            {entry.output && (
              <div>
                <p className="text-muted-foreground font-sans font-medium text-[10px] mb-1 uppercase tracking-wide">Output</p>
                <pre className="bg-muted/40 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                  {entry.output.slice(0, 1200)}{entry.output.length > 1200 ? '\n… (truncated)' : ''}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Card renderers ────────────────────────────────────────────────────────────

function renderDocCards(toolEvents: ToolEventEntry[]) {
  return toolEvents
    .filter(te => te.tool === 'create_document' && !te.inProgress && !!te.output)
    .flatMap((te, i) => {
      try {
        const parsed = JSON.parse(te.output!) as {
          success?: boolean
          data?: { document_id?: string; title?: string; document_type?: string; audience?: string }
        }
        if (parsed.success && parsed.data?.document_id) {
          const d = parsed.data as { document_id: string; title: string; document_type?: string; audience?: string }
          return [(
            <div
              key={`doc-${i}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 px-4 py-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300 truncate">
                    {d.title || 'Document created'}
                  </p>
                  {(d.document_type || d.audience) && (
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      {[d.document_type?.replace(/_/g, ' '), d.audience].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                  <Link href={`/documents/${d.document_id}`}>
                    <ExternalLink className="h-3 w-3 mr-1" /> Open
                  </Link>
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                  <Link href="/documents">
                    <Library className="h-3 w-3 mr-1" /> Documents
                  </Link>
                </Button>
              </div>
            </div>
          )]
        }
      } catch { /* non-JSON */ }
      return []
    })
}

function renderReportCards(toolEvents: ToolEventEntry[]) {
  return toolEvents
    .filter(te => te.tool === 'render_report' && !te.inProgress && !!te.output)
    .flatMap((te, i) => {
      try {
        const parsed = JSON.parse(te.output!) as {
          success?: boolean
          data?: { report_id?: string; report_name?: string }
        }
        if (parsed.success && parsed.data?.report_id) {
          const d = parsed.data as { report_id: string; report_name: string }
          return [(
            <div
              key={`report-${i}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950 px-4 py-3"
            >
              <span className="text-sm font-medium text-green-800 dark:text-green-300 flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0" />
                {d.report_name || 'Report generated'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                  <Link href={`/view/report/${d.report_id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 mr-1" /> View Report
                  </Link>
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                  <Link href="/reports/custom">
                    <Library className="h-3 w-3 mr-1" /> Library
                  </Link>
                </Button>
              </div>
            </div>
          )]
        }
      } catch { /* non-JSON */ }
      return []
    })
}

// ─── Run stream page ───────────────────────────────────────────────────────────

export default function RunStreamPage() {
  const params = useParams<{ runId: string }>()
  const router = useRouter()

  const [agent,         setAgent]         = useState<Agent | null>(null)
  const [run,           setRun]           = useState<AgentRun | null>(null)
  const [status,        setStatus]        = useState<RunStatus>('queued')
  const [textOutput,    setTextOutput]    = useState('')
  const [toolEvents,    setToolEvents]    = useState<ToolEventEntry[]>([])
  const [tokens,        setTokens]        = useState(0)
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [durationSecs,  setDurationSecs]  = useState(0)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelling,    setCancelling]    = useState(false)
  const [copied,        setCopied]        = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [toolEvents.length, textOutput])

  const loadMetaAndStream = useCallback(async () => {
    const infoRes = await fetch(`/api/agents/runs/${params.runId}/info`).catch(() => null)
    if (infoRes?.ok) {
      const infoJson = await infoRes.json()
      if (infoJson.data?.run)   setRun(infoJson.data.run)
      if (infoJson.data?.agent) setAgent(infoJson.data.agent)
      if (infoJson.data?.run?.status) setStatus(infoJson.data.run.status)
    }
    setLoading(false)

    const runRes = await fetch(`/api/agents/runs/${params.runId}/stream`).catch(() => null)
    if (!runRes?.ok || !runRes.body) {
      setErrorMsg(`Stream error: ${runRes?.status ?? 'unknown'}`)
      return
    }

    const start = Date.now()
    setStatus('running')

    const reader  = runRes.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        let event: RunEvent
        try { event = JSON.parse(line.slice(6)) as RunEvent }
        catch { continue }

        if (event.type === 'text') {
          setTextOutput(prev => prev + event.content)
        } else if (event.type === 'tool_start') {
          setToolEvents(prev => [...prev, { tool: event.tool, input: event.input, inProgress: true }])
        } else if (event.type === 'tool_end') {
          const summary = summariseTool(event.tool, event.output ?? '')
          setToolEvents(prev => prev.map(te =>
            te.tool === event.tool && te.inProgress
              ? { ...te, output: event.output, inProgress: false, resultSummary: summary }
              : te
          ))
        } else if (event.type === 'done') {
          setTokens(event.tokens)
          setStatus('success')
          setDurationSecs(Math.round((Date.now() - start) / 1000))
        } else if (event.type === 'error') {
          setErrorMsg(event.message)
          setStatus('error')
          setDurationSecs(Math.round((Date.now() - start) / 1000))
        } else if (event.type === 'cancelled') {
          setStatus('cancelled')
          setDurationSecs(Math.round((Date.now() - start) / 1000))
        }
      }
    }
  }, [params.runId])

  useEffect(() => { void loadMetaAndStream() }, [loadMetaAndStream])

  async function handleRetry() {
    if (!run?.agent_id) return
    const res  = await fetch(`/api/agents/${run.agent_id}/run`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(run.input_context),
    })
    const json = await res.json()
    if (res.ok) router.push(`/agents/runs/${json.data.run_id as string}`)
  }

  async function handleCancel() {
    setCancelling(true)
    const res = await fetch(`/api/agents/runs/${params.runId}/cancel`, { method: 'POST' })
    if (!res.ok) setCancelConfirm(false)
    setCancelling(false)
    setCancelConfirm(false)
  }

  async function handleCopyOutput() {
    await navigator.clipboard.writeText(textOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const cfg    = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued
  const isDone = status === 'success' || status === 'error' || status === 'cancelled'

  // ── Derived values for section badges ──
  const completedToolCount = toolEvents.filter(te => !te.inProgress).length

  const activityBadge = isDone
    ? `${completedToolCount} tool call${completedToolCount !== 1 ? 's' : ''} · ${durationSecs}s`
    : undefined

  const wordCount   = textOutput.trim() ? textOutput.trim().split(/\s+/).length : 0
  const outputBadge = isDone
    ? (errorMsg ? 'Error' : (textOutput ? `~${wordCount.toLocaleString()} words` : status === 'cancelled' ? 'Cancelled' : ''))
    : undefined

  const promptText = run?.input_context?.extra_instructions ?? ''
  const briefBadge = promptText
    ? (promptText.length > 60 ? promptText.slice(0, 57) + '…' : promptText)
    : 'No additional instructions'

  const modelLabel = run?.model_used
    ? run.model_used.includes('opus') ? 'Claude Opus 4'
      : run.model_used === 'gpt-4o'   ? 'GPT-4o'
      : 'Claude Sonnet 4'
    : null

  const docCards    = renderDocCards(toolEvents)
  const reportCards = renderReportCards(toolEvents)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link href={run?.agent_id ? `/agents/${run.agent_id}/runs` : '/agents'}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Run History
          </Link>
        </Button>
        {agent && (
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
            style={{ backgroundColor: agent.avatar_color }}
          >
            {agent.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{agent?.name ?? 'Agent'}</p>
        </div>
        <Badge className={cn('gap-1', cfg.badgeClass)}>
          {status === 'running'   && <Loader2      className="h-3 w-3 animate-spin" />}
          {status === 'success'   && <CheckCircle2 className="h-3 w-3" />}
          {status === 'error'     && <XCircle      className="h-3 w-3" />}
          {status === 'cancelled' && <Ban          className="h-3 w-3" />}
          {cfg.label}
        </Badge>
        {run?.started_at && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(run.started_at).toLocaleTimeString()}
          </span>
        )}

        {/* Cancel button — only while running */}
        {status === 'running' && !cancelConfirm && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
            onClick={() => setCancelConfirm(true)}
          >
            <Ban className="h-3.5 w-3.5 mr-1.5" /> Cancel Run
          </Button>
        )}
        {status === 'running' && cancelConfirm && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Cancel this run?</span>
            <Button
              size="sm" variant="outline"
              className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
              onClick={() => void handleCancel()}
              disabled={cancelling}
            >
              {cancelling && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Confirm
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => setCancelConfirm(false)} disabled={cancelling}>
              Nevermind
            </Button>
          </div>
        )}
      </div>

      {/* ── Brief section (collapsed by default) ── */}
      <CollapsibleSection title="Brief" defaultOpen={false} badge={briefBadge}>
        <div className="space-y-3 pt-0.5">
          {/* Prompt / extra instructions */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Prompt</p>
            {promptText ? (
              <p className="text-sm text-foreground leading-relaxed">{promptText}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No additional instructions</p>
            )}
          </div>

          {/* Agent + model */}
          {agent && (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agent</p>
              <span className="text-sm">{agent.name}</span>
              {modelLabel && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{modelLabel}</Badge>
              )}
            </div>
          )}

          {/* Tools */}
          {agent && agent.tools.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Tools</p>
              <div className="flex flex-wrap gap-1">
                {agent.tools.map(t => (
                  <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {TOOL_LABEL[t] ?? t.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Period context */}
          {run?.input_context?.period && (
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Period</p>
              <span className="text-sm">{run.input_context.period}</span>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ── Activity section ── */}
      <CollapsibleSection title="Activity" defaultOpen={true} badge={activityBadge}>
        <div className="space-y-3">
          {/* Thinking indicator — shown before first tool call */}
          {status === 'running' && toolEvents.length === 0 && (
            <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400 animate-pulse shrink-0" />
              Thinking…
            </div>
          )}

          {/* Tool call timeline */}
          {toolEvents.map((te, i) => (
            <TimelineEntry key={i} entry={te} />
          ))}

          {/* Live text output — shown while running */}
          {!isDone && textOutput && (
            <div className="border-t pt-3 mt-1">
              <MarkdownText content={textOutput} />
              {status === 'running' && (
                <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5 rounded-sm" />
              )}
            </div>
          )}

          {/* Empty state for completed run with no tools */}
          {isDone && toolEvents.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No tool calls in this run</p>
          )}

          <div ref={bottomRef} />
        </div>
      </CollapsibleSection>

      {/* ── Output section — appears after run completes ── */}
      {isDone && (
        <CollapsibleSection title="Output" defaultOpen={true} badge={outputBadge}>
          <div className="space-y-3 pt-0.5">
            {/* Model + tokens meta */}
            {(modelLabel ?? tokens > 0) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {modelLabel && <span>{modelLabel}</span>}
                {tokens > 0 && <span>· {tokens.toLocaleString()} tokens</span>}
              </div>
            )}

            {/* Error block */}
            {errorMsg && (
              <div className="flex items-start gap-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">Error</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 break-words">{errorMsg}</p>
                </div>
              </div>
            )}

            {/* Document + Report cards */}
            {(docCards.length > 0 || reportCards.length > 0) && (
              <div className="space-y-2">
                {docCards}
                {reportCards}
              </div>
            )}

            {/* Text output */}
            {textOutput && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Response</p>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => void handleCopyOutput()}>
                    {copied
                      ? <><Check className="h-3 w-3 mr-1" /> Copied</>
                      : <><Copy  className="h-3 w-3 mr-1" /> Copy</>}
                  </Button>
                </div>
                <MarkdownText content={textOutput} />
              </div>
            )}

            {/* Cancelled with no output */}
            {status === 'cancelled' && !textOutput && !errorMsg && docCards.length === 0 && reportCards.length === 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400 italic">
                Run was cancelled before producing output.
              </p>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Run Again button ── */}
      {isDone && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void handleRetry()}>
            <Play className="h-3 w-3 mr-1" /> Run Again
          </Button>
        </div>
      )}

    </div>
  )
}
