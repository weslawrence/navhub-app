'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

/**
 * Legacy + fallback invite landing page.
 *
 * The primary invite flow now bounces through /auth/callback (the PKCE
 * code-exchange handler). This page exists for two reasons:
 *
 *   1. Stale invite emails that still point here as their redirectTo
 *   2. Supabase's default behaviour of putting tokens in the URL hash
 *      fragment when an admin invite link is opened in a browser that
 *      already has an active session (no `code=` param to bounce on)
 *
 * On mount we:
 *   • Read the Supabase session — Supabase's client auto-exchanges the
 *     hash fragment on construction, so getSession() usually succeeds
 *   • Fall back to manually calling setSession() with access_token /
 *     refresh_token pulled from the URL hash if getSession() came up
 *     empty
 *   • POST /api/auth/claim-invites to attach the user to every group
 *     invite keyed to their email
 *   • Redirect to /landing
 */
export default function AcceptInvitePage() {
  const [status,  setStatus]  = useState<'verifying' | 'success' | 'error'>('verifying')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const supabase = createClient()

    async function run() {
      try {
        // 1. Did Supabase auto-exchange the hash fragment?
        const initial = await supabase.auth.getSession()
        let session = initial.data.session

        // 2. Fall back to a manual setSession() with the tokens from the
        //    URL hash. Common when the invite link opens in a tab that
        //    already had an active Supabase session — auto-exchange skips
        //    and the tokens stay parked in window.location.hash.
        if (!session && typeof window !== 'undefined' && window.location.hash) {
          const hash = window.location.hash.startsWith('#')
            ? window.location.hash.slice(1)
            : window.location.hash
          const params       = new URLSearchParams(hash)
          const accessToken  = params.get('access_token')
          const refreshToken = params.get('refresh_token')
          if (accessToken && refreshToken) {
            const { data, error } = await supabase.auth.setSession({
              access_token:  accessToken,
              refresh_token: refreshToken,
            })
            if (error) throw error
            session = data.session
          }
        }

        if (!session) {
          throw new Error('No session in the invite link. The link may have expired.')
        }

        // 3. Claim any pending invites for this email. Idempotent — already-
        //    joined groups are no-ops.
        await fetch('/api/auth/claim-invites', { method: 'POST' }).catch(() => null)

        setStatus('success')
        // Brief success state before redirecting so the user sees confirmation.
        setTimeout(() => { window.location.href = '/landing' }, 1200)
      } catch (err) {
        console.error('[accept-invite]', err)
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Something went wrong')
      }
    }

    void run()
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Nav<span style={{ color: 'var(--group-primary)' }}>Hub</span>
          </h1>
        </div>

        <div className="mb-4 text-4xl" aria-hidden>
          {status === 'verifying' ? '⏳' : status === 'success' ? '✅' : '❌'}
        </div>

        <h2 className="text-lg font-semibold text-foreground mb-2">
          {status === 'verifying' ? 'Setting up your account…'
           : status === 'success' ? 'You\'re in!'
           : 'Something went wrong'}
        </h2>

        <p className="text-sm text-muted-foreground">
          {status === 'verifying' ? 'Please wait while we verify your invitation.'
           : status === 'success'  ? 'Redirecting you to NavHub…'
           : message || 'Your invite link may have expired. Ask to be reinvited.'}
        </p>

        {status === 'error' && (
          <Link
            href="/login"
            className="inline-block mt-6 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Go to login →
          </Link>
        )}
      </div>
    </div>
  )
}
