'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Loader2, Bot, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CashflowItem } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReviewItem extends CashflowItem {
  agent_run_id?: string | null
}

interface CashFlowReviewModalProps {
  companyId:  string
  items:      ReviewItem[]
  onClose:    () => void
  onUpdated:  () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style:    'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

const SECTION_LABELS: Record<string, string> = {
  inflow:           'Inflow',
  regular_outflow:  'Regular Outflow',
  payable:          'Payable',
}

const RECURRENCE_LABELS: Record<string, string> = {
  weekly:      'Weekly',
  fortnightly: 'Fortnightly',
  monthly:     'Monthly',
  one_off:     'One-off',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CashFlowReviewModal({
  companyId,
  items,
  onClose,
  onUpdated,
}: CashFlowReviewModalProps) {
  const [busy,    setBusy]    = useState<Record<string, boolean>>({})
  const [bulkOp,  setBulkOp]  = useState<'accept_all' | 'reject_all' | null>(null)
  const [done,    setDone]    = useState<Record<string, 'accepted' | 'rejected'>>({})
  const [error,   setError]   = useState<string | null>(null)

  const pendingCount = items.filter(i => !done[i.id]).length

  async function patchItem(itemId: string, updates: Record<string, unknown>) {
    setBusy(b => ({ ...b, [itemId]: true }))
    try {
      const res = await fetch(`/api/cashflow/${companyId}/items/${itemId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(updates),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Update failed')
      }
    } finally {
      setBusy(b => ({ ...b, [itemId]: false }))
    }
  }

  async function handleAccept(item: ReviewItem) {
    try {
      await patchItem(item.id, { pending_review: false })
      setDone(d => ({ ...d, [item.id]: 'accepted' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept item')
    }
  }

  async function handleReject(item: ReviewItem) {
    try {
      await patchItem(item.id, { is_active: false })
      setDone(d => ({ ...d, [item.id]: 'rejected' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject item')
    }
  }

  async function handleAcceptAll() {
    setBulkOp('accept_all')
    setError(null)
    try {
      for (const item of items) {
        if (done[item.id]) continue
        await patchItem(item.id, { pending_review: false })
        setDone(d => ({ ...d, [item.id]: 'accepted' }))
      }
      onUpdated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk accept failed')
    } finally {
      setBulkOp(null)
    }
  }

  async function handleRejectAll() {
    setBulkOp('reject_all')
    setError(null)
    try {
      for (const item of items) {
        if (done[item.id]) continue
        await patchItem(item.id, { is_active: false })
        setDone(d => ({ ...d, [item.id]: 'rejected' }))
      }
      onUpdated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk reject failed')
    } finally {
      setBulkOp(null)
    }
  }

  function handleClose() {
    // If some items were actioned, trigger a refresh
    if (Object.keys(done).length > 0) onUpdated()
    else onClose()
  }

  // Agent run IDs for the "View agent run" link
  const runIds = Array.from(new Set(items.map(i => i.agent_run_id).filter(Boolean))) as string[]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background border rounded-xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">Agent Suggestions</h2>
            {pendingCount > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium px-2 py-0.5">
                {pendingCount} pending
              </span>
            )}
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Agent run link(s) */}
        {runIds.length > 0 && (
          <div className="px-5 py-2 border-b shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            <span>Suggested by agent run</span>
            {runIds.map(id => (
              <a
                key={id}
                href={`/agents/runs/${id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                view run <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="px-5 py-2 text-sm text-destructive bg-destructive/10 shrink-0">
            {error}
          </p>
        )}

        {/* Item list */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
          {items.map(item => {
            const outcome = done[item.id]
            const isBusy  = busy[item.id]

            return (
              <div
                key={item.id}
                className={`rounded-lg border p-4 transition-opacity ${
                  outcome ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="bg-muted px-1.5 py-0.5 rounded">
                        {SECTION_LABELS[item.section] ?? item.section}
                      </span>
                      <span>{formatCents(item.amount_cents)}</span>
                      <span>{RECURRENCE_LABELS[item.recurrence] ?? item.recurrence}</span>
                      {item.start_date && <span>from {item.start_date}</span>}
                      {item.end_date && <span>until {item.end_date}</span>}
                    </div>
                  </div>

                  {/* Status / actions */}
                  {outcome === 'accepted' ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                      <CheckCircle2 className="h-4 w-4" /> Accepted
                    </span>
                  ) : outcome === 'rejected' ? (
                    <span className="flex items-center gap-1 text-xs text-red-500 shrink-0">
                      <XCircle className="h-4 w-4" /> Rejected
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleAccept(item)}
                        disabled={isBusy}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-green-400/50 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 disabled:opacity-50 transition-colors"
                      >
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Accept
                      </button>
                      <button
                        onClick={() => handleReject(item)}
                        disabled={isBusy}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-red-400/50 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                      >
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No pending suggestions
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t shrink-0">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleAcceptAll}
              disabled={pendingCount === 0 || bulkOp !== null}
              className="text-green-700 dark:text-green-400 border-green-400/50 hover:bg-green-50 dark:hover:bg-green-950/30"
            >
              {bulkOp === 'accept_all' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
              Accept All
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRejectAll}
              disabled={pendingCount === 0 || bulkOp !== null}
              className="text-red-700 dark:text-red-400 border-red-400/50 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              {bulkOp === 'reject_all' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
              Reject All
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={handleClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
