import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// ─── GET /auth/callback ───────────────────────────────────────────────────────
// Server-side OAuth/magic-link callback. Supabase redirects here with a `code`
// query parameter when using the PKCE flow (the more robust path — works
// regardless of cookie / fragment-sharing quirks across browsers).
//
// Flow:
//   1. Exchange the `code` for a session (sets the auth cookies).
//   2. Look up every pending group_invites row for the user's email.
//   3. Insert user_groups membership using the role recorded on the invite,
//      copy any full_name into user_metadata, mark each invite accepted_at.
//   4. Set active_group_id cookie to the FIRST claimed group when the user
//      had no prior memberships.
//   5. Redirect to ?next= (default /landing).
//
// On code-exchange failure, redirect to /login?error=auth_failed.

export async function GET(request: Request) {
  const url  = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/landing'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin))
  }

  const supabase = createClient()
  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeErr) {
    console.error('[auth/callback] exchange failed:', exchangeErr.message)
    return NextResponse.redirect(new URL('/login?error=auth_failed', url.origin))
  }

  const { data: { user } } = await supabase.auth.getUser()
  let firstClaimedGroupId: string | null = null

  if (user?.email) {
    const admin = createAdminClient()
    const email = user.email.toLowerCase()

    // Existing default — only the first claimed invite for a user with no
    // prior default group is allowed to set is_default=true.
    const { data: existingDefault } = await admin
      .from('user_groups')
      .select('group_id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle()
    let setDefault = !existingDefault

    const { data: pendingInvites } = await admin
      .from('group_invites')
      .select('id, group_id, role, full_name')
      .eq('email', email)
      .is('accepted_at', null)

    let nameToCopy: string | null = null

    for (const invite of (pendingInvites ?? []) as Array<{
      id: string; group_id: string; role: string; full_name: string | null
    }>) {
      const { error: upsertErr } = await admin
        .from('user_groups')
        .upsert(
          {
            user_id:    user.id,
            group_id:   invite.group_id,
            role:       invite.role,
            is_default: setDefault,
          },
          { onConflict: 'user_id,group_id' },
        )
      if (upsertErr) {
        console.error('[auth/callback] upsert failed:', upsertErr.message)
        continue
      }

      if (!firstClaimedGroupId) firstClaimedGroupId = invite.group_id
      if (invite.full_name && !nameToCopy) nameToCopy = invite.full_name
      setDefault = false

      void admin
        .from('group_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id)
    }

    if (nameToCopy) {
      const existingName = (user.user_metadata as { full_name?: string } | null)?.full_name
      if (!existingName || !existingName.trim()) {
        try {
          await admin.auth.admin.updateUserById(user.id, {
            user_metadata: { ...(user.user_metadata ?? {}), full_name: nameToCopy },
          })
        } catch (err) {
          console.error('[auth/callback] failed to set full_name:', err)
        }
      }
    }
  }

  const response = NextResponse.redirect(new URL(next, url.origin))
  if (firstClaimedGroupId) {
    response.cookies.set('active_group_id', firstClaimedGroupId, {
      httpOnly: false,
      path:     '/',
      maxAge:   60 * 60 * 24 * 365,
    })
  }
  return response
}
