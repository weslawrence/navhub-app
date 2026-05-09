'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label }  from '@/components/ui/label'

interface FeedbackModalProps {
  open:    boolean
  onClose: () => void
}

/**
 * Three-question structured feedback modal:
 *   • What were you trying to do?
 *   • What happened?
 *   • What would you have wanted to happen?
 *
 * Posts to /api/feedback (writes user_suggestions row + sends ack email).
 * Sage triages submissions automatically from the admin /admin/suggestions
 * page; this modal is purely the capture surface.
 */
export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [whatTrying,   setWhatTrying]   = useState('')
  const [whatHappened, setWhatHappened] = useState('')
  const [whatWanted,   setWhatWanted]   = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [submitted,    setSubmitted]    = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // Reset internal state every time the modal opens — avoids the stale
  // "Thanks for the feedback" panel re-appearing on second open.
  useEffect(() => {
    if (!open) return
    setWhatTrying('')
    setWhatHappened('')
    setWhatWanted('')
    setSubmitted(false)
    setError(null)
  }, [open])

  if (!open) return null

  const valid = whatTrying.trim() && whatHappened.trim() && whatWanted.trim()

  async function handleSubmit() {
    if (!valid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          what_trying:   whatTrying.trim(),
          what_happened: whatHappened.trim(),
          what_wanted:   whatWanted.trim(),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Submit failed')
      }
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-lg w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-sm font-semibold">Share feedback</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-8 px-6 text-center">
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Thanks for the feedback</p>
              <p className="text-xs text-muted-foreground mt-1">
                We&apos;ll review it and get back to you when we&apos;ve had a chance to look.
              </p>
            </div>
            <Button onClick={onClose} variant="outline" size="sm">Close</Button>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Help us improve NavHub. Three quick questions.
              </p>

              <FieldRow label="What were you trying to do?">
                <textarea
                  value={whatTrying}
                  onChange={e => setWhatTrying(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. Run an agent to analyse our Q1 financials"
                />
              </FieldRow>

              <FieldRow label="What happened?">
                <textarea
                  value={whatHappened}
                  onChange={e => setWhatHappened(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. The agent stopped halfway through with an error"
                />
              </FieldRow>

              <FieldRow label="What would you have wanted to happen?">
                <textarea
                  value={whatWanted}
                  onChange={e => setWhatWanted(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. The agent should complete the analysis and save the report"
                />
              </FieldRow>

              {error && (
                <p className="text-xs text-destructive">{error}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
              <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={!valid || submitting}>
                {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
                Submit feedback
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
