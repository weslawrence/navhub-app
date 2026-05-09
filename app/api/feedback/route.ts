import { NextResponse }      from 'next/server'
import { cookies }            from 'next/headers'
import { createClient }       from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// ─── POST /api/feedback ─────────────────────────────────────────────────────
// Captures a structured user feedback row in user_suggestions. Sends a
// best-effort acknowledgement email via Resend; failures are logged but
// don't fail the request — the suggestion is the source of truth.
//
// Body: { what_trying, what_happened, what_wanted }
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value ?? null

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // Accept both camelCase (older client builds) and snake_case keys.
  const whatTrying   = typeof body.what_trying   === 'string' ? body.what_trying.trim()
                     : typeof body.whatTrying    === 'string' ? body.whatTrying.trim()
                     : ''
  const whatHappened = typeof body.what_happened === 'string' ? body.what_happened.trim()
                     : typeof body.whatHappened  === 'string' ? body.whatHappened.trim()
                     : ''
  const whatWanted   = typeof body.what_wanted   === 'string' ? body.what_wanted.trim()
                     : typeof body.whatWanted    === 'string' ? body.whatWanted.trim()
                     : ''

  if (!whatTrying || !whatHappened || !whatWanted) {
    return NextResponse.json(
      { error: 'what_trying, what_happened and what_wanted are all required' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_suggestions')
    .insert({
      group_id:      activeGroupId,
      submitted_by:  session.user.id,
      what_trying:   whatTrying,
      what_happened: whatHappened,
      what_wanted:   whatWanted,
      status:        'submitted',
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Acknowledgement email — best-effort. Resend not being configured in
  // local dev shouldn't block the response.
  if (process.env.RESEND_API_KEY && session.user.email) {
    try {
      const { Resend } = await import('resend')
      const resend     = new Resend(process.env.RESEND_API_KEY)
      const fromDomain = process.env.RESEND_FROM_DOMAIN ?? 'navhub.co'
      void resend.emails.send({
        from:    `NavHub <notifications@${fromDomain}>`,
        to:      session.user.email,
        subject: 'We received your feedback',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;color:#222">
            <p style="margin:0 0 12px">Thanks for taking the time to share feedback.</p>
            <p style="margin:0 0 12px">We've logged your suggestion and will review it.
              You'll hear from us when we've had a chance to look at it.</p>
            <p style="margin:24px 0 0;font-size:12px;color:#888">Reference: ${data.id}</p>
          </div>
        `,
      }).catch((err: unknown) => {
        console.error('[feedback] email send failed:', err)
      })
    } catch (err) {
      console.error('[feedback] Resend client failed:', err)
    }
  }

  return NextResponse.json({ data: { id: (data as { id: string }).id } }, { status: 201 })
}
