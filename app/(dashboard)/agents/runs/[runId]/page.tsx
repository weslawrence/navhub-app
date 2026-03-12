'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, CheckCircle2, XCircle, Loader2, Clock, Copy, Check,
  Play, ChevronDown, ChevronRight, FileText, AlertCircle, ExternalLink, Library,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge }  from '@/components/ui/badge'
import { cn }     from '@/lib/utils'
import type { Agent, AgentRun, RunStatus } from '@/lib/types'
import type { RunEvent } from '@/lib/agent-runner'

// ─── Status config ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<RunStatus, { label: string; badgeClass: string }> = {
  queued:    { label: 'Queued',    badgeClass: 'bg-muted text-muted-foreground' },
  running:   { label: 'Running',   badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  success:   { label: 'Complete',  badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  error:     { label: 'Error',     badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  cancelled: { label: 'Cancelled', badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
}

// ─── Formatted text renderer (basic markdown) ──────────────────────────────

function MarkdownText({ content }: { content: string }) {
  // Convert basic markdown to simple styled spans
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

// ─── Tool call block ───────────────────────────────────────────────────────

function ToolBlock({
  tool, input, output, inProgress,
}: {
  tool:       string
  input?:     Record<string, unknown>
  output?:    string
  inProgress?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const toolEmoji: Record<string, string> = {
    read_financials:       '📊',
    read_companies:        '🏢',
    generate_report:       '📄',
    send_slack:            '💬',
    send_email:            '📧',
    list_report_templates: '📋',
    read_report_template:  '🔍',
    create_report_template:'✨',
    update_report_template:'✏️',
    render_report:         '🖨️',
    analyse_document:      '🔬',
  }

  return (
    <div className="border rounded-md overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
      >
        <span>{toolEmoji[tool] ?? '🔧'}</span>
        <span className="font-medium capitalize">{tool.replace(/_/g, ' ')}</span>
        {inProgress
          ? <Loader2 className="h-3 w-3 animate-spin ml-auto text-blue-500" />
          : output
            ? <CheckCircle2 className="h-3 w-3 ml-auto text-green-500" />
            : null}
        {!inProgress && (expanded
          ? <ChevronDown className="h-3 w-3 ml-auto" />
          : <ChevronRight className="h-3 w-3 ml-auto" />)}
      </button>
      {expanded && (
        <div className="p-3 space-y-2 font-mono text-[11px]">
          {input && Object.keys(input).length > 0 && (
            <div>
              <p className="text-muted-foreground font-sans font-medium mb-1">Input</p>
              <pre className="bg-muted/30 p-2 rounded text-[11px] overflow-x-auto">
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}
          {output && (
            <div>
              <p className="text-muted-foreground font-sans font-medium mb-1">Output</p>
              <pre className="bg-muted/30 p-2 rounded text-[11px] overflow-x-auto whitespace-pre-wrap">
                {output.slice(0, 1000)}{output.length > 1000 ? '\n… (truncated)' : ''}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Run stream page ───────────────────────────────────────────────────────

export default function RunStreamPage() {
  const params = useParams<{ runId: string }>()
  const router = useRouter()

  const [agent,         setAgent]         = useState<Agent | null>(null)
  const [run,           setRun]           = useState<AgentRun | null>(null)
  const [status,        setStatus]        = useState<RunStatus>('queued')
  const [textOutput,    setTextOutput]    = useState('')
  const [toolEvents,    setToolEvents]    = useState<Array<{
    tool:       string
    input?:     Record<string, unknown>
    output?:    string
    inProgress: boolean
  }>>([])
  const [tokens,        setTokens]        = useState(0)
  const [errorMsg,      setErrorMsg]      = useState<string | null>(null)
  const [draftReportId, setDraftReportId] = useState<string | null>(null)
  const [copied,        setCopied]        = useState(false)
  const [loading,       setLoading]       = useState(true)

  const outputRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom as output streams
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [textOutput, toolEvents])

const loadMetaAndStream = useCallback(async () => {
    // Load run metadata first
    const runRes = await fetch(`/api/agents/runs/${params.runId}/stream`).catch(() => null)
    if (!runRes) { setLoading(false); setErrorMsg('Failed to connect to stream'); return }
    
    // Load run info separately
    const infoRes = await fetch(`/api/agents/runs/${params.runId}/info`).catch(() => null)
    if (infoRes?.ok) {
      const infoJson = await infoRes.json()
      if (infoJson.data?.run)   setRun(infoJson.data.run)
      if (infoJson.data?.agent) setAgent(infoJson.data.agent)
      if (infoJson.data?.run?.status) setStatus(infoJson.data.run.status)
      if (infoJson.data?.run?.draft_report_id) setDraftReportId(infoJson.data.run.draft_report_id)
    }

    setLoading(false)

    if (!runRes.ok || !runRes.body) {
      setErrorMsg(`Stream error: ${runRes.status}`)
      return
    }

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
          setToolEvents(prev => prev.map(te =>
            te.tool === event.tool && te.inProgress
              ? { ...te, output: event.output, inProgress: false }
              : te
          ))
        } else if (event.type === 'done') {
          setTokens(event.tokens)
          setStatus('success')
        } else if (event.type === 'error') {
          setErrorMsg(event.message)
          setStatus('error')
        }
      }
    }
  }, [params.runId])

  useEffect(() => {
    void loadMetaAndStream()
  }, [loadMetaAndStream])

  async function handleCopy() {
    await navigator.clipboard.writeText(textOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
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
          {status === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === 'success' && <CheckCircle2 className="h-3 w-3" />}
          {status === 'error'   && <XCircle className="h-3 w-3" />}
          {cfg.label}
        </Badge>
        {run?.started_at && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {new Date(run.started_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Draft report banner */}
      {draftReportId && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-4 py-2.5">
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Draft report generated
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
            <Link href={`/reports/custom/${draftReportId}`}>Review Draft</Link>
          </Button>
        </div>
      )}

      {/* Error banner */}
      {errorMsg && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Run failed</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 break-words">{errorMsg}</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => void handleRetry()}>
            <Play className="h-3 w-3 mr-1" /> Retry
          </Button>
        </div>
      )}

      {/* Tool call log */}
      {toolEvents.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Tool calls</p>
          {toolEvents.map((te, i) => (
            <ToolBlock
              key={i}
              tool={te.tool}
              input={te.input}
              output={te.output}
              inProgress={te.inProgress}
            />
          ))}
        </div>
      )}

      {/* Report Generated cards — extracted from render_report tool results */}
      {toolEvents
        .filter(te => te.tool === 'render_report' && !te.inProgress && !!te.output)
        .flatMap((te, i) => {
          try {
            const parsed = JSON.parse(te.output!) as {
              success?: boolean
              data?: { report_id?: string; report_name?: string; view_url?: string }
            }
            if (parsed.success && parsed.data?.report_id) {
              const d = parsed.data as { report_id: string; report_name: string; view_url?: string }
              return [(
                <div
                  key={`report-card-${i}`}
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
          } catch { /* non-JSON output — ignore */ }
          return []
        })
      }

      {/* Output area */}
      <div
        ref={outputRef}
        className={cn(
          'rounded-lg border bg-card p-4 overflow-y-auto',
          status === 'running' ? 'min-h-48' : 'min-h-32',
          'max-h-[60vh]'
        )}
      >
        {status === 'running' && !textOutput && toolEvents.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Agent is thinking…
          </div>
        )}
        {textOutput && <MarkdownText content={textOutput} />}
        {status === 'running' && (
          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5 rounded-sm" />
        )}
      </div>

      {/* Footer */}
      {status !== 'running' && status !== 'queued' && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>
            {tokens > 0 && `${tokens.toLocaleString()} tokens used`}
            {run?.model_used && ` · ${run.model_used.includes('opus') ? 'Claude Opus 4' : run.model_used === 'gpt-4o' ? 'GPT-4o' : 'Claude Sonnet 4'}`}
          </span>
          <div className="flex gap-2">
            {textOutput && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void handleCopy()}>
                {copied ? <><Check className="h-3 w-3 mr-1" /> Copied</> : <><Copy className="h-3 w-3 mr-1" /> Copy</>}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void handleRetry()}>
              <Play className="h-3 w-3 mr-1" /> Run Again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
