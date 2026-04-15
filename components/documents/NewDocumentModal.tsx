'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, PenLine, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label }  from '@/components/ui/label'
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_AUDIENCE_LABELS,
  type DocumentType,
  type DocumentAudience,
  type DocumentFolder,
  type Company,
} from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Props {
  folders:          DocumentFolder[]
  companies:        Company[]
  defaultFolderId?: string
  onClose:          () => void
  onCreated:        () => void
}

type Step = 'pick' | 'manual' | 'agent'

const FINANCIAL_TYPES: DocumentType[] = [
  'financial_analysis', 'cash_flow_review', 'board_report',
  'budget_vs_actual', 'business_health', 'tax_position',
  'due_diligence', 'investor_briefing',
]

function isFinancialType(t: DocumentType) {
  return FINANCIAL_TYPES.includes(t)
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function NewDocumentModal({ folders, companies, defaultFolderId, onClose, onCreated }: Props) {
  const router = useRouter()

  const [step,        setStep]        = useState<Step>('pick')
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Shared fields
  const [title,       setTitle]       = useState('')
  const [docType,     setDocType]     = useState<DocumentType>('financial_analysis')
  const [audience,    setAudience]    = useState<DocumentAudience>('internal')
  const [companyId,   setCompanyId]   = useState('')
  const [folderId,    setFolderId]    = useState(defaultFolderId ?? '')

  // Agent extra
  const [usePL,          setUsePL]          = useState(false)
  const [usePLPeriod,    setUsePLPeriod]    = useState('')
  const [useBS,          setUseBS]          = useState(false)
  const [useBSPeriod,    setUseBSPeriod]    = useState('')
  const [useCF,          setUseCF]          = useState(false)
  const [useCompanyInfo, setUseCompanyInfo] = useState(true)
  const [extraInstructions, setExtraInstructions] = useState('')

  // Agent selector
  const [agents,        setAgents]        = useState<{ id: string; name: string; tools: string[] }[]>([])
  const [agentId,       setAgentId]       = useState('')
  const [agentsLoaded,  setAgentsLoaded]  = useState(false)

  async function loadAgents() {
    if (agentsLoaded) return
    try {
      const res  = await fetch('/api/agents')
      const json = await res.json()
      const list = ((json.data ?? []) as { id: string; name: string; is_active: boolean; tools: string[] }[])
        .filter(a => a.is_active)
      setAgents(list)
      if (list.length > 0) setAgentId(list[0].id)
    } catch { /* ignore */ }
    setAgentsLoaded(true)
  }

  function handlePickStep(s: Step) {
    setStep(s)
    if (s === 'agent') void loadAgents()
  }

  // ── Manual create ───────────────────────────────────────────────────────

  async function handleManualCreate() {
    if (!title.trim()) { setError('Title is required'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res  = await fetch('/api/documents', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:         title.trim(),
          document_type: docType,
          audience,
          company_id:    companyId || null,
          folder_id:     folderId  || null,
          content_markdown: '',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create document')
      router.push(`/documents/${json.data.id as string}?edit=1`)
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create')
      setSubmitting(false)
    }
  }

  // ── Agent create ────────────────────────────────────────────────────────

  async function handleAgentLaunch() {
    if (!title.trim()) { setError('Title is required'); return }
    if (!agentId)      { setError('Select an agent'); return }
    if (isFinancialType(docType) && !companyId) { setError('Company is required for financial documents'); return }
    setSubmitting(true)
    setError(null)
    try {
      // 1. Create the document record (draft)
      const docRes  = await fetch('/api/documents', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:         title.trim(),
          document_type: docType,
          audience,
          company_id:    companyId || null,
          folder_id:     folderId  || null,
          status:        'draft',
          content_markdown: '',
        }),
      })
      const docJson = await docRes.json()
      if (!docRes.ok) throw new Error(docJson.error ?? 'Failed to create document')
      const docId = docJson.data.id as string

      // 2. Assemble document creation prompt
      const companyName = companies.find(c => c.id === companyId)?.name ?? 'Unknown Company'
      const audienceGuidance: Record<string, string> = {
        board:      'Executive summary style. Lead with conclusions. Use tables for financials. Concise narrative.',
        management: 'Detailed operational focus. Include commentary on variances. Actionable recommendations.',
        investor:   'Commercial framing. Highlight growth, margins, and risks. Confident and forward-looking.',
        internal:   'Plain language. Include context and background. Can reference internal processes.',
        hr:         'Structured and formal. Clear headings. Precise language. Suitable for employment purposes.',
        external:   'Professional and polished. Assume no internal knowledge. No jargon.',
      }

      const dataContextLines: string[] = []
      if (usePL)         dataContextLines.push(`* P&L data — period: ${usePLPeriod || 'latest available'}`)
      if (useBS)         dataContextLines.push(`* Balance Sheet data — period: ${useBSPeriod || 'latest available'}`)
      if (useCF)         dataContextLines.push(`* 13-week Cash Flow forecast`)
      if (useCompanyInfo) dataContextLines.push(`* Company information for ${companyName}`)

      const prompt = [
        `You are creating a ${DOCUMENT_TYPE_LABELS[docType]} document.`,
        `Document title: "${title.trim()}"`,
        `Target audience: ${DOCUMENT_AUDIENCE_LABELS[audience]}`,
        companyId ? `Company: ${companyName}` : '',
        '',
        `Audience guidance:`,
        audienceGuidance[audience] ? `- ${audienceGuidance[audience]}` : '',
        '',
        dataContextLines.length > 0 ? 'Data context to use:' : '',
        ...dataContextLines,
        extraInstructions ? `\nAdditional instructions: ${extraInstructions}` : '',
        '',
        'Use the create_document tool to save your complete output.',
        'Write the full document content in markdown.',
        'Use ## for section headings, tables for numerical data, bullet lists for key points.',
        `Set document_id to: ${docId}`,
      ].filter(l => l !== undefined).join('\n')

      // 3. Launch agent run
      const runRes  = await fetch(`/api/agents/${agentId}/run`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          period:             usePLPeriod || useBSPeriod || undefined,
          company_ids:        companyId ? [companyId] : undefined,
          extra_instructions: prompt,
        }),
      })
      const runJson = await runRes.json()
      if (!runRes.ok) throw new Error(runJson.error ?? 'Failed to launch agent')

      router.push(`/agents/runs/${runJson.data.run_id as string}`)
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to launch agent')
      setSubmitting(false)
    }
  }

  // ── Shared fields ───────────────────────────────────────────────────────

  function SharedFields() {
    return (
      <div className="space-y-3">
        {/* Title */}
        <div className="space-y-1">
          <Label>Title <span className="text-destructive">*</span></Label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Q3 Board Report — Navigate Group"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Type */}
        <div className="space-y-1">
          <Label>Document Type</Label>
          <select
            value={docType}
            onChange={e => setDocType(e.target.value as DocumentType)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* Audience */}
        <div className="space-y-1">
          <Label>Audience</Label>
          <select
            value={audience}
            onChange={e => setAudience(e.target.value as DocumentAudience)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {Object.entries(DOCUMENT_AUDIENCE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* Company */}
        {companies.length > 0 && (
          <div className="space-y-1">
            <Label>
              Company
              {isFinancialType(docType) && step === 'agent' && (
                <span className="text-destructive"> *</span>
              )}
              {!(isFinancialType(docType) && step === 'agent') && (
                <span className="text-muted-foreground text-xs font-normal ml-1">(optional)</span>
              )}
            </Label>
            <select
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">— None —</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Folder */}
        {folders.length > 0 && (
          <div className="space-y-1">
            <Label>Folder <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <select
              value={folderId}
              onChange={e => setFolderId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Unfiled</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-background border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          {step !== 'pick' && (
            <button
              onClick={() => { setStep('pick'); setError(null) }}
              className="text-xs text-muted-foreground hover:text-foreground mr-3"
            >
              ← Back
            </button>
          )}
          <h2 className="text-base font-semibold flex-1">New Document</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Step 1: Pick method */}
          {step === 'pick' && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handlePickStep('manual')}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-colors text-center"
              >
                <PenLine className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-semibold text-sm">Write Manually</p>
                  <p className="text-xs text-muted-foreground mt-1">Start with a blank document and write content yourself</p>
                </div>
              </button>
              <button
                onClick={() => handlePickStep('agent')}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-dashed hover:border-primary hover:bg-primary/5 transition-colors text-center"
              >
                <Sparkles className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-semibold text-sm">Create with Agent</p>
                  <p className="text-xs text-muted-foreground mt-1">AI generates a draft using your financial data</p>
                </div>
              </button>
            </div>
          )}

          {/* Step 2a: Write manually */}
          {step === 'manual' && (
            <div className="space-y-4">
              <SharedFields />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
                <Button onClick={() => void handleManualCreate()} disabled={submitting}>
                  {submitting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating…</> : 'Create Document'}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2b: Create with agent */}
          {step === 'agent' && (
            <div className="space-y-4">
              <SharedFields />

              {/* Agent selector */}
              <div className="space-y-1">
                <Label>Agent <span className="text-destructive">*</span></Label>
                {!agentsLoaded ? (
                  <p className="text-xs text-muted-foreground">Loading agents…</p>
                ) : agents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active agents configured.</p>
                ) : (
                  <select
                    value={agentId}
                    onChange={e => setAgentId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Data context */}
              <div className="space-y-2">
                <Label>Data context</Label>
                <div className="rounded-md border p-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={usePL} onChange={e => setUsePL(e.target.checked)} className="rounded" />
                    P&L data
                    {usePL && (
                      <input
                        value={usePLPeriod}
                        onChange={e => setUsePLPeriod(e.target.value)}
                        placeholder="YYYY-MM (leave blank for latest)"
                        className="ml-2 flex h-7 rounded-md border border-input bg-transparent px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    )}
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={useBS} onChange={e => setUseBS(e.target.checked)} className="rounded" />
                    Balance Sheet data
                    {useBS && (
                      <input
                        value={useBSPeriod}
                        onChange={e => setUseBSPeriod(e.target.value)}
                        placeholder="YYYY-MM (leave blank for latest)"
                        className="ml-2 flex h-7 rounded-md border border-input bg-transparent px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    )}
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={useCF} onChange={e => setUseCF(e.target.checked)} className="rounded" />
                    Cash Flow forecast
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={useCompanyInfo} onChange={e => setUseCompanyInfo(e.target.checked)} className="rounded" />
                    Company information
                  </label>
                </div>
              </div>

              {/* Additional instructions */}
              <div className="space-y-1">
                <Label>Additional instructions <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
                <textarea
                  value={extraInstructions}
                  onChange={e => setExtraInstructions(e.target.value)}
                  placeholder="Specific points to cover, tone adjustments, sections to include…"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
                <Button onClick={() => void handleAgentLaunch()} disabled={submitting || !agentsLoaded}>
                  {submitting
                    ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Launching…</>
                    : <><Sparkles className="h-4 w-4 mr-1.5" /> Launch Agent</>}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
