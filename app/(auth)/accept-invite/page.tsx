'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter }    from 'next/navigation'
import { createClient }                  from '@/lib/supabase/client'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button }                        from '@/components/ui/button'
import { Input }                         from '@/components/ui/input'
import { Label }                         from '@/components/ui/label'

// Inner component — uses useSearchParams (requires Suspense boundary)
function AcceptInviteForm() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const supabase     = createClient()

  const groupId = searchParams.get('group_id') ?? ''
  const role    = searchParams.get('role') ?? 'company_viewer'

  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error,           setError]           = useState<string | null>(null)
  const [loading,         setLoading]         = useState(false)
  const [sessionReady,    setSessionReady]    = useState(false)

  // Supabase sets a temporary session via the invite link hash fragment.
  // We listen for SIGNED_IN before enabling the form.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setSessionReady(true)
      }
    })

    // Also check if session is already present (page reload scenario)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      // Set the user's password
      const { error: updateErr } = await supabase.auth.updateUser({ password })
      if (updateErr) { setError(updateErr.message); return }

      // Preferred path: when a group_id is on the URL, hit the per-group
      // join route — it validates that the invite was actually issued to
      // this email and sets the active_group_id cookie.
      if (groupId) {
        const res = await fetch(`/api/groups/${groupId}/join`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ role }),
        })
        if (!res.ok) {
          const json = await res.json().catch(() => ({})) as { error?: string }
          console.warn('[accept-invite] join error:', json.error)
        }
      }

      // Always run the claim-all fallback — covers the case where the URL
      // group_id is missing/stale, AND any additional pending invites the
      // same email has been sent. Idempotent for already-joined groups.
      try {
        await fetch('/api/auth/claim-invites', { method: 'POST' })
      } catch (err) {
        console.warn('[accept-invite] claim-invites failed:', err)
      }

      router.replace('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  if (!sessionReady) {
    return (
      <div className="text-center text-muted-foreground text-sm py-8">
        Verifying your invite link…
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Min. 8 characters"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Setting up account…' : 'Set password & continue'}
      </Button>
    </form>
  )
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* NavHub wordmark */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Nav<span style={{ color: 'var(--group-primary)' }}>Hub</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You&apos;ve been invited to join NavHub
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <p className="text-sm text-center text-muted-foreground">
              Set a password to activate your account
            </p>
          </CardHeader>
          <CardContent>
            <Suspense fallback={
              <div className="text-center text-muted-foreground text-sm py-8">Loading…</div>
            }>
              <AcceptInviteForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
