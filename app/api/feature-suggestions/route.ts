import { NextResponse }    from 'next/server'
import { cookies }         from 'next/headers'
import { createClient }    from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { email?: string; suggestion?: string }
  const { email, suggestion } = body

  if (!email || !suggestion?.trim()) {
    return NextResponse.json({ error: 'Email and suggestion are required' }, { status: 400 })
  }

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value ?? null

  const admin = createAdminClient()

  // Insert feature suggestion
  const { error: insertError } = await admin
    .from('feature_suggestions')
    .insert({
      group_id:   activeGroupId,
      user_id:    session.user.id,
      email:      email.trim(),
      suggestion: suggestion.trim(),
    })

  if (insertError) {
    console.error('feature_suggestion insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save suggestion' }, { status: 500 })
  }

  // Send email notification via Resend (non-blocking)
  const resendKey    = process.env.RESEND_API_KEY
  const fromDomain   = process.env.RESEND_FROM_DOMAIN
  const supportEmail = process.env.SUPPORT_EMAIL

  if (resendKey && fromDomain && supportEmail) {
    void fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `NavHub <noreply@${fromDomain}>`,
        to:      [supportEmail],
        subject: `[NavHub Feature] Suggestion from ${email}`,
        html: `
          <p><strong>From:</strong> ${email}</p>
          <p><strong>User ID:</strong> ${session.user.id}</p>
          <p><strong>Group ID:</strong> ${activeGroupId ?? 'N/A'}</p>
          <hr />
          <p>${suggestion.replace(/\n/g, '<br>')}</p>
        `,
      }),
    }).catch(err => console.error('Resend feature suggestion email error:', err))
  }

  return NextResponse.json({ success: true })
}
