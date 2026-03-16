'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter }  from 'next/navigation'
import { Play, X, Loader2, FileText } from 'lucide-react'
import { Button }    from '@/components/ui/button'
import { Label }     from '@/components/ui/label'
import { cn }        from '@/lib/utils'
import type { Agent, Company } from '@/lib/types'

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
  agent:   Agent
  onClose: () => void
}

export default function RunModal({ agent, onClose }: RunModalProps) {
  const router  = useRouter()
  const periods = getLastNMonths(12)

  // Period toggle — persisted per agent in localStorage (default: off)
  const [includePeriod,      setIncludePeriod]      = useState(false)
  const [period,             setPeriod]             = useState(periods[0])
  const [companies,          setCompanies]          = useState<Company[]>([])
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([])
  const [extraInstructions,  setExtraInstructions]  = useState('')
  const [submitting,         setSubmitting]         = useState(false)
  const [error,              setError]              = useState<string | null>(null)

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
      onClose()
      router.push(`/agents/runs/${json.data.run_id as string}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-background border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">

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
            placeholder="Any additional context for this run..."
            rows={3}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
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

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleRun} disabled={submitting}>
            {submitting
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Starting…</>
              : <><Play className="h-4 w-4 mr-1.5" /> Run Agent</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
