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

  const body = await req.json().catch(() => ({})) as { email?: string; message?: string }
  const { email, message } = body

  if (!email || !message?.trim()) {
    return NextResponse.json({ error: 'Email and message are required' }, { status: 400 })
  }

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value ?? null

  const admin = createAdminClient()

  // Insert support request
  const { error: insertError } = await admin
    .from('support_requests')
    .insert({
      group_id: activeGroupId,
      user_id:  session.user.id,
      email:    email.trim(),
      message:  message.trim(),
    })

  if (insertError) {
    console.error('support_request insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save request' }, { status: 500 })
  }

  // Send email notification via Resend (non-blocking)
  const resendKey   = process.env.RESEND_API_KEY
  const fromDomain  = process.env.RESEND_FROM_DOMAIN
  const supportEmail = process.env.SUPPORT_EMAIL

  if (resendKey && fromDomain && supportEmail) {
    void fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `NavHub Support <noreply@${fromDomain}>`,
        to:      [supportEmail],
        subject: `[NavHub Support] New request from ${email}`,
        html: `
          <p><strong>From:</strong> ${email}</p>
          <p><strong>User ID:</strong> ${session.user.id}</p>
          <p><strong>Group ID:</strong> ${activeGroupId ?? 'N/A'}</p>
          <hr />
          <p>${message.replace(/\n/g, '<br>')}</p>
        `,
      }),
    }).catch(err => console.error('Resend support email error:', err))
  }

  return NextResponse.json({ success: true })
}
