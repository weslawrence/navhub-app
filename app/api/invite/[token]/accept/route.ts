import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// ─── POST /api/invite/[token]/accept ────────────────────────────────────────
// The /invite/<token> landing page calls this when the user clicks "Accept
// invitation". It's the ONLY place the underlying Supabase action_link is
// read — by keeping it out of HTML and only returning it in a POST
// response, link scanners (Outlook Safe Links etc.) can't consume the
// one-time OTP before the user gets to it.
//
// Marks the token used before returning to prevent replay if someone
// somehow calls this endpoint twice. The OTP itself is also single-use on
// Supabase's side, but belt-and-braces.
export async function POST(
  _request: Request,
  { params }: { params: { token: string } },
) {
  const admin = createAdminClient()

  const { data: invite, error } = await admin
    .from('invite_tokens')
    .select('id, action_link, used_at, expires_at')
    .eq('token', params.token)
    .single()

  if (error || !invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  const inv = invite as {
    id:          string
    action_link: string
    used_at:     string | null
    expires_at:  string
  }

  if (inv.used_at) {
    return NextResponse.json({ error: 'This invite has already been used' }, { status: 422 })
  }
  if (new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite has expired' }, { status: 422 })
  }

  // Mark used immediately so a stray retry can't burn the OTP twice.
  await admin
    .from('invite_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', inv.id)

  // The action_link is returned ONLY in the POST response body — never
  // embedded in HTML, never logged. The client uses it for a one-shot
  // window.location.href redirect.
  return NextResponse.json({ redirectUrl: inv.action_link })
}
