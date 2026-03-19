import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      name?: string
      email?: string
      company?: string
      message?: string
    }

    const { name, email, company, message } = body

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin.from('demo_requests').insert({
      name:    name.trim(),
      email:   email.trim(),
      company: company?.trim() || null,
      message: message?.trim() || null,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Send Resend notification (non-fatal)
    const notifyEmail = process.env.DEMO_NOTIFICATION_EMAIL
    if (notifyEmail && process.env.RESEND_API_KEY) {
      void fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:    `NavHub <noreply@${process.env.RESEND_FROM_DOMAIN ?? 'navhub.co'}>`,
          to:      notifyEmail,
          subject: `New demo request from ${name.trim()}`,
          html: [
            `<p><strong>Name:</strong> ${name.trim()}</p>`,
            `<p><strong>Email:</strong> ${email.trim()}</p>`,
            `<p><strong>Company:</strong> ${company?.trim() || '—'}</p>`,
            `<p><strong>Message:</strong></p><p>${message?.trim() || '—'}</p>`,
          ].join(''),
        }),
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Demo API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
