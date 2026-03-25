'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter }  from 'next/navigation'
import { Play, X, Loader2, FileText, MessageSquare, Send, Paperclip } from 'lucide-react'
import { Button }    from '@/components/ui/button'
import { Label }     from '@/components/ui/label'
import { cn }        from '@/lib/utils'
import type { Agent, Company } from '@/lib/types'

const ACCEPTED_TYPES = '.pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.pptx,.ppt,.html'
const MAX_ATTACHMENTS = 5

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getLastNMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

/** localStorage key for per-agent period-toggle state */
function periodKey(agentId: string) {
  return `navhub:agent-period:${agentId}`
}

// ─── Run Modal ─────────────────────────────────────────────────────────────────

interface RunModalProps {
  agent:                Agent
  onClose:              () => void
  initialInstructions?: string
}

export default function RunModal({ agent, onClose, initialInstructions = '' }: RunModalProps) {
  const router     = useRouter()
  const periods    = getLastNMonths(12)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Period toggle — persisted per agent in localStorage (default: off)
  const [includePeriod,      setIncludePeriod]      = useState(false)
  const [period,             setPeriod]             = useState(periods[0])
  const [companies,          setCompanies]          = useState<Company[]>([])
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([])
  const [extraInstructions,  setExtraInstructions]  = useState(initialInstructions)
  const [submitting,         setSubmitting]         = useState(false)
  const [error,              setError]              = useState<string | null>(null)

  // Attachments
  const [attachments,       setAttachments]       = useState<File[]>([])
  const [attachmentError,   setAttachmentError]   = useState<string | null>(null)
  
  // ─── Awaiting-input (ask_user) state ───────────────────────────────────────
  const [runId,        setRunId]        = useState<string | null>(null)
  const [awaitingInput, setAwaitingInput] = useState<{ question: string } | null>(null)
  const [replyText,    setReplyText]    = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [replyError,   setReplyError]   = useState<string | null>(null)

  // Restore per-agent period toggle state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(periodKey(agent.id))
    if (saved === 'true') setIncludePeriod(true)
  }, [agent.id])

  // Load companies for scope selection
  useEffect(() => {
    fetch('/api/companies')
      .then(r => r.json())
      .then(json => {
        const list = (json.data ?? []) as Company[]
        setCompanies(list.filter(c => c.is_active))
        if (agent.company_scope && agent.company_scope.length > 0) {
          setSelectedCompanyIds(agent.company_scope)
        }
      })
      .catch(() => {})
  }, [agent.company_scope])
  
  function handlePeriodToggle() {
    const next = !includePeriod
    setIncludePeriod(next)
    localStorage.setItem(periodKey(agent.id), next ? 'true' : 'false')
  }

  function addAttachments(files: File[]) {
    setAttachmentError(null)
    setAttachments(prev => {
      const combined = [...prev, ...files]
      if (combined.length > MAX_ATTACHMENTS) {
        setAttachmentError(`Maximum ${MAX_ATTACHMENTS} files allowed`)
        return prev.slice(0, MAX_ATTACHMENTS)
      }
      return combined
    })
  }

  function removeAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index))
    setAttachmentError(null)
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addAttachments(Array.from(e.target.files))
    e.target.value = ''
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter(item => item.type.startsWith('image/'))
    const imageFiles = imageItems
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null)
    if (imageFiles.length > 0) addAttachments(imageFiles)
  }

  function toggleCompany(id: string) {
    setSelectedCompanyIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // Rough token estimate for system prompt context
  const estimatedTokens = useMemo(() => {
    let tokens = 2000 // base: persona + instructions + group context
    if (includePeriod) tokens += 800 // period context + available periods list
    tokens += 1500 // available financial data context (periods, metadata)
    const companyCount = selectedCompanyIds.length > 0 ? selectedCompanyIds.length : companies.length
    tokens += companyCount * 300 // per-company info in scope
    return tokens
  }, [includePeriod, selectedCompanyIds, companies.length])

  // ─── Launch run + poll briefly for awaiting_input ──────────────────────────

  async function handleRun() {
    setSubmitting(true)
    setError(null)
    try {
      const res  = await fetch(`/api/agents/${agent.id}/run`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          // Only include period when toggle is on
          ...(includePeriod ? { period } : {}),
          company_ids:        selectedCompanyIds.length > 0 ? selectedCompanyIds : undefined,
          extra_instructions: extraInstructions.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to start run')

      const id = json.data.run_id as string
      setRunId(id)

      // Upload attachments if any
      if (attachments.length > 0) {
        for (const file of attachments) {
          try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('run_id', id)
            await fetch(`/api/agents/runs/${id}/attachments`, { method: 'POST', body: fd })
          } catch {
            // Non-fatal — continue
          }
        }
      }

      // Poll for up to 5 seconds to detect if the agent immediately asks a question
      const deadline = Date.now() + 5_000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 500))
        try {
          const infoRes = await fetch(`/api/agents/runs/${id}/info`)
          if (infoRes.ok) {
            const infoJson = await infoRes.json()
            const runData  = infoJson.data?.run as { status?: string; awaiting_input_question?: string } | undefined
            if (runData?.status === 'awaiting_input') {
              // Agent paused and is waiting for user input — show reply card
              setAwaitingInput({ question: runData.awaiting_input_question ?? 'Please provide more information.' })
              setSubmitting(false)
              return
            }
            // If run has moved past queued/running, no need to keep polling
            if (runData?.status && !['queued', 'running'].includes(runData.status)) {
              break
            }
          }
        } catch {
          // Network error during poll — ignore and continue to navigation
        }
      }

      // No awaiting_input detected within 5s — navigate to run stream page
      onClose()
      router.push(`/agents/runs/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run')
      setSubmitting(false)
    }
  }

  // ─── Send reply to awaiting agent ──────────────────────────────────────────

  async function handleSendReply() {
    if (!runId || !replyText.trim()) return
    setSendingReply(true)
    setReplyError(null)
    try {
      // interaction_id is omitted — respond route will find the latest unanswered interaction
      const res = await fetch(`/api/agents/runs/${runId}/respond`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ answer: replyText.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to send reply')
      // Reply sent — navigate to run stream page
      onClose()
      router.push(`/agents/runs/${runId}`)
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to send reply')
      setSendingReply(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={awaitingInput ? undefined : onClose} />

      {/* Dialog */}
      <div className="relative bg-background border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">

        {/* ── Awaiting-input reply card (replaces normal form when agent is waiting) ── */}
        {awaitingInput ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Agent Needs Your Input</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{agent.name}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
              <p className="text-sm text-amber-900 dark:text-amber-100 font-medium">
                {awaitingInput.question}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Your reply</Label>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendReply() }
                }}
                placeholder="Type your answer here…"
                rows={3}
                autoFocus
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
              <p className="text-xs text-muted-foreground">Press Enter to send, Shift+Enter for newline</p>
            </div>

            {replyError && (
              <p className="text-sm text-destructive">{replyError}</p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => { onClose(); router.push(`/agents/runs/${runId ?? ''}`) }}>
                View Run
              </Button>
              <Button onClick={() => void handleSendReply()} disabled={sendingReply || !replyText.trim()}>
                {sendingReply
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending…</>
                  : <><Send className="h-4 w-4 mr-1.5" /> Send Reply</>}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* ── Normal run form ── */}

            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Run Agent</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{agent.name}</p>
              </div>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Period context toggle ── */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium leading-none">Include period context</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Pass a financial period to the agent&apos;s prompt
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includePeriod}
                onClick={handlePeriodToggle}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full',
                  'border-2 border-transparent transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  includePeriod ? 'bg-primary' : 'bg-input'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full',
                    'bg-background shadow-lg ring-0 transition-transform',
                    includePeriod ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {/* Period selector — visible only when toggle is on */}
            {includePeriod && (
              <div className="space-y-1.5">
                <Label>Period</Label>
                <select
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {periods.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Company scope */}
            {companies.length > 0 && (
              <div className="space-y-1.5">
                <Label>
                  Companies
                  <span className="text-muted-foreground text-xs font-normal ml-2">
                    (leave all unselected to use all)
                  </span>
                </Label>
                <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-md border p-2">
                  {companies.map(company => (
                    <label key={company.id} className="flex items-center gap-2 cursor-pointer px-1">
                      <input
                        type="checkbox"
                        checked={selectedCompanyIds.includes(company.id)}
                        onChange={() => toggleCompany(company.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{company.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Token estimate */}
            <div className={cn(
              'flex items-center justify-between rounded-md px-3 py-2 text-xs',
              estimatedTokens > 20000
                ? 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                : 'bg-muted/50 text-muted-foreground'
            )}>
              <span>Estimated context size</span>
              <span className="font-medium tabular-nums">
                ~{estimatedTokens.toLocaleString()} tokens
                {estimatedTokens > 20000 && ' — large context, consider fewer companies'}
              </span>
            </div>

            {/* Extra instructions */}
            <div className="space-y-1.5">
              <Label>
                Extra instructions
                <span className="text-muted-foreground text-xs font-normal ml-2">(optional)</span>
              </Label>
              <textarea
                value={extraInstructions}
                onChange={e => setExtraInstructions(e.target.value)}
                onPaste={handlePaste}
                placeholder="Any additional context for this run..."
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Attachments
                  <span className="ml-1 font-normal">({attachments.length}/{MAX_ATTACHMENTS})</span>
                </Label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Paperclip className="h-3 w-3" /> Attach files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_TYPES}
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {attachments.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs bg-muted/50"
                    >
                      <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="max-w-[140px] truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="ml-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {attachmentError && (
                <p className="text-xs text-destructive">{attachmentError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Paste images directly into the instructions field. Files are available to the agent via read_attachment.
              </p>
            </div>

            {/* render_report note */}
            {agent.tools?.includes('render_report') && (
              <div className="flex items-start gap-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-3 py-2.5">
                <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  This agent can generate reports. Any report created during the run will be saved
                  automatically to your <strong>Reports Library</strong>.
                </p>
              </div>
            )}

            {submitting && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting run… checking for initial questions
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={() => void handleRun()} disabled={submitting}>
                {submitting
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Starting…</>
                  : <><Play className="h-4 w-4 mr-1.5" /> Run Agent</>}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
