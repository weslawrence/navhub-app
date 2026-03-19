'use client'

import { useState } from 'react'
import { X, Loader2, CheckCircle2, Headphones } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'

interface SupportModalProps {
  userEmail: string
  onClose:   () => void
}

export default function SupportModal({ userEmail, onClose }: SupportModalProps) {
  const [email,   setEmail]   = useState(userEmail)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/support', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, message }),
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
          <Headphones className="h-4 w-4 text-blue-500 shrink-0" />
          <h2 className="font-semibold text-foreground flex-1">Get Support</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-10 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="font-medium text-foreground">Request sent!</p>
            <p className="text-sm text-muted-foreground">
              We&apos;ll get back to you at <strong>{email}</strong> as soon as we can.
            </p>
            <Button onClick={onClose} className="mt-2">Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Describe the issue or question — we typically respond within one business day.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="sup-email">Your email</Label>
              <Input
                id="sup-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sup-message">How can we help?</Label>
              <textarea
                id="sup-message"
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={5}
                required
                placeholder="Describe the issue, what you expected, and what actually happened…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none text-foreground"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={loading || !message.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Request'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
