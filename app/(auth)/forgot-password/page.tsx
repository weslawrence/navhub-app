'use client'

import { useState, Suspense }            from 'react'
import Link                               from 'next/link'
import { useSearchParams }               from 'next/navigation'
import { createClient }                  from '@/lib/supabase/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button }                        from '@/components/ui/button'
import { Input }                         from '@/components/ui/input'
import { Label }                         from '@/components/ui/label'

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.navhub.co'

function ForgotPasswordForm() {
  const searchParams = useSearchParams()
  const [email,   setEmail]   = useState(searchParams.get('email') ?? '')
  const [sent,    setSent]    = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    const supabase = createClient()
    // Always show success regardless of whether the email exists (security best practice)
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${appUrl}/reset-password`,
    })
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-foreground">
          If an account exists for <strong>{email}</strong>, you'll
          receive a password reset link shortly.
        </p>
        <p className="text-xs text-muted-foreground">
          Didn't receive it? Check your spam folder or try again.
        </p>
        <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
          Try again
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  )
}

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* NavHub wordmark */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Nav<span style={{ color: 'var(--group-primary)' }}>Hub</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reset your password
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <p className="text-sm text-center text-muted-foreground">
              Enter your email to receive a reset link
            </p>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="py-4 text-center text-sm text-muted-foreground">Loading…</div>}>
              <ForgotPasswordForm />
            </Suspense>

            <div className="mt-4 text-center">
              <Link
                href="/login"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
