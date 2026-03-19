'use client'

import { useState } from 'react'
import { X, Loader2, CheckCircle2, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'

interface FeatureSuggestionModalProps {
  userEmail: string
  onClose:   () => void
}

export default function FeatureSuggestionModal({ userEmail, onClose }: FeatureSuggestionModalProps) {
  const [email,      setEmail]      = useState(userEmail)
  const [suggestion, setSuggestion] = useState('')
  const [loading,    setLoading]    = useState(false)
  const [done,       setDone]       = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!suggestion.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/feature-suggestions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, suggestion }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? 'Failed to send')
      }
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <Lightbulb className="h-4 w-4 text-yellow-500 shrink-0" />
          <h2 className="font-semibold text-foreground flex-1">Suggest a Feature</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-10 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="font-medium text-foreground">Suggestion received!</p>
            <p className="text-sm text-muted-foreground">
              Thanks — we&apos;ll review your idea and may reach out at <strong>{email}</strong>.
            </p>
            <Button onClick={onClose} className="mt-2">Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Got an idea for a new feature or improvement? We&apos;d love to hear it.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="feat-email">Your email</Label>
              <Input
                id="feat-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feat-suggestion">Your idea</Label>
              <textarea
                id="feat-suggestion"
                value={suggestion}
                onChange={e => setSuggestion(e.target.value)}
                rows={5}
                required
                placeholder="Describe the feature, why it would be useful, and how you imagine it working…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none text-foreground"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={loading || !suggestion.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Suggestion'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
