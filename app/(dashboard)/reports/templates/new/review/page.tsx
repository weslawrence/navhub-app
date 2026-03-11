'use client'

import { useEffect, useState } from 'react'
import { useRouter }           from 'next/navigation'
import Link                    from 'next/link'
import { ChevronLeft, Check, Loader2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }               from '@/components/ui/badge'
import { cn }                  from '@/lib/utils'
import type { SlotDefinition } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateProposal {
  name:               string
  template_type:      string
  description:        string
  design_tokens:      Record<string, string>
  slots:              SlotDefinition[]
  agent_instructions: string
  confidence:         'high' | 'medium' | 'low'
  notes:              string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewTemplatePage() {
  const router = useRouter()

  const [proposal,  setProposal]  = useState<TemplateProposal | null>(null)
  const [filename,  setFilename]  = useState<string>('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    const raw  = sessionStorage.getItem('template_proposal')
    const name = sessionStorage.getItem('template_proposal_filename')
    if (!raw) {
      router.push('/reports/templates/new')
      return
    }
    try {
      setProposal(JSON.parse(raw) as TemplateProposal)
      setFilename(name ?? 'document')
    } catch {
      router.push('/reports/templates/new')
    }
  }, [router])

  async function handleSave() {
    if (!proposal) return
    setSaving(true)
    setError(null)
    try {
      const body = {
        name:               proposal.name,
        template_type:      proposal.template_type,
        description:        proposal.description,
        design_tokens:      proposal.design_tokens ?? {},
        slots:              proposal.slots ?? [],
        agent_instructions: proposal.agent_instructions ?? null,
      }
      const res  = await fetch('/api/report-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')

      sessionStorage.removeItem('template_proposal')
      sessionStorage.removeItem('template_proposal_filename')
      router.push(`/reports/templates/${json.data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error saving template')
      setSaving(false)
    }
  }

  function handleEditInFull() {
    if (!proposal) return
    // Pass proposal to manual editor via sessionStorage
    sessionStorage.setItem('template_prefill', JSON.stringify(proposal))
    router.push('/reports/templates/new/manual')
  }

  if (!proposal) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const tokenCount = Object.keys(proposal.design_tokens ?? {}).length
  const slotCount  = (proposal.slots ?? []).length

  const CONFIDENCE_COLORS = {
    high:   'text-green-600 dark:text-green-400',
    medium: 'text-amber-600 dark:text-amber-400',
    low:    'text-red-600 dark:text-red-400',
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/reports/templates/new" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Review Agent Proposal</h1>
          <p className="text-sm text-muted-foreground">
            Analysed from <span className="font-medium">{filename}</span>
            {proposal.confidence && (
              <span className={cn('ml-2 font-medium', CONFIDENCE_COLORS[proposal.confidence ?? 'medium'])}>
                · {proposal.confidence} confidence
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Notes from agent */}
      {proposal.notes && (
        <div className="flex gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {proposal.notes}
        </div>
      )}

      {/* Two-column diff */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Left — Source */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Source Document</h2>

          <Card>
            <CardHeader><CardTitle className="text-sm">File</CardTitle></CardHeader>
            <CardContent className="text-sm text-foreground space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Filename</span>
                <span>{filename}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Detected Content</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <Row label="Inferred type" value={proposal.template_type} />
              <Row label="Slot count"    value={`${slotCount} slot${slotCount !== 1 ? 's' : ''} identified`} />
              <Row label="Token count"   value={tokenCount > 0 ? `${tokenCount} design token${tokenCount !== 1 ? 's' : ''}` : '— none detected'} muted={tokenCount === 0} />
              <Row label="Instructions"  value={proposal.agent_instructions ? '✓ Generated' : '— none'} muted={!proposal.agent_instructions} />
            </CardContent>
          </Card>
        </div>

        {/* Right — Proposal */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wide">Agent Proposal</h2>

          <Card className="border-primary/20">
            <CardHeader><CardTitle className="text-sm">Metadata</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div>
                <span className="text-muted-foreground block text-xs mb-0.5">Name</span>
                <span className="font-medium text-foreground">{proposal.name}</span>
              </div>
              {proposal.description && (
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Description</span>
                  <span className="text-foreground">{proposal.description}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground block text-xs mb-0.5">Type</span>
                <Badge variant="outline" className="text-xs capitalize">{proposal.template_type}</Badge>
              </div>
            </CardContent>
          </Card>

          {slotCount > 0 && (
            <Card className="border-primary/20">
              <CardHeader><CardTitle className="text-sm">Slots ({slotCount})</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {(proposal.slots ?? []).map((slot, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-primary/10 text-primary border border-primary/20">
                      <Check className="h-2.5 w-2.5" />
                      {slot.name}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {tokenCount > 0 && (
            <Card className="border-primary/20">
              <CardHeader><CardTitle className="text-sm">Design Tokens ({tokenCount})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {Object.entries(proposal.design_tokens ?? {}).map(([key, value]) => {
                    const isColor = /^#[0-9a-fA-F]{3,8}$|^rgb|^hsl/.test(value)
                    return (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        {isColor && (
                          <span className="w-4 h-4 rounded border border-border/50 shrink-0"
                            style={{ backgroundColor: value }} />
                        )}
                        <code className="text-muted-foreground">{`{{${key}}}`}</code>
                        <span className="text-foreground ml-auto font-mono">{value}</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 py-4 border-t">
        <div className="text-sm text-muted-foreground">
          {slotCount} slot{slotCount !== 1 ? 's' : ''}, {tokenCount} design token{tokenCount !== 1 ? 's' : ''}
        </div>

        <div className="flex items-center gap-3">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            onClick={handleEditInFull}
            className="px-4 py-2 rounded-md border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Edit in Full Editor
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--palette-primary)' }}
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Accept & Save Template →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('text-right', muted ? 'text-muted-foreground italic' : 'text-foreground')}>{value}</span>
    </div>
  )
}
