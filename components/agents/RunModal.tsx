'use client'

import { useState, useEffect } from 'react'
import { useRouter }  from 'next/navigation'
import { Play, X, Loader2 } from 'lucide-react'
import { Button }    from '@/components/ui/button'
import { Label }     from '@/components/ui/label'
import { cn }        from '@/lib/utils'
import type { Agent, Company } from '@/lib/types'

// ─── Run Modal ─────────────────────────────────────────────────────────────────

interface RunModalProps {
  agent:     Agent
  onClose:   () => void
}

function getLastNMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

export default function RunModal({ agent, onClose }: RunModalProps) {
  const router  = useRouter()
  const periods = getLastNMonths(12)

  const [period,             setPeriod]             = useState(periods[0])
  const [companies,          setCompanies]          = useState<Company[]>([])
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([])
  const [extraInstructions,  setExtraInstructions]  = useState('')
  const [submitting,         setSubmitting]         = useState(false)
  const [error,              setError]              = useState<string | null>(null)

  // Load companies for scope selection
  useEffect(() => {
    fetch('/api/companies')
      .then(r => r.json())
      .then(json => {
        const list = (json.data ?? []) as Company[]
        setCompanies(list.filter(c => c.is_active))
        // Pre-select scoped companies
        if (agent.company_scope && agent.company_scope.length > 0) {
          setSelectedCompanyIds(agent.company_scope)
        }
      })
      .catch(() => {})
  }, [agent.company_scope])

  function toggleCompany(id: string) {
    setSelectedCompanyIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleRun() {
    setSubmitting(true)
    setError(null)
    try {
      const res  = await fetch(`/api/agents/${agent.id}/run`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          period,
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

        {/* Period */}
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
