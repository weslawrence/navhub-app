import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

// ── POST /api/admin/suggestions/[id]/notify ─────────────────────────────────
// Body: { message: string, status?: 'acknowledged' | 'declined' | 'shipped' }
//
// Sends a status-update email to the user who submitted the suggestion,
// records `user_notified_at`, and optionally bumps the suggestion status.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 })

  const allowedStatuses = ['acknowledged', 'declined', 'shipped', 'acting']
  const newStatus = typeof body.status === 'string' && allowedStatuses.includes(body.status)
    ? body.status
    : null

  const admin = createAdminClient()
  const { data: suggestion } = await admin
    .from('user_suggestions')
    .select('id, submitted_by, what_trying')
    .eq('id', params.id)
    .single()
  if (!suggestion) return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })

  const submittedBy = (suggestion as { submitted_by: string | null }).submitted_by
  if (!submittedBy) {
    return NextResponse.json({ error: 'Submitter unknown — cannot send response' }, { status: 422 })
  }

  // Resolve the submitter's email via auth.admin.
  let toEmail: string | null = null
  try {
    const { data: userRow } = await admin.auth.admin.getUserById(submittedBy)
    toEmail = userRow.user?.email ?? null
  } catch {
    toEmail = null
  }
  if (!toEmail) return NextResponse.json({ error: 'Submitter email not found' }, { status: 422 })

  // Send via Resend (best-effort — failure still records the attempt).
  if (process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend')
      const resend     = new Resend(process.env.RESEND_API_KEY)
      const fromDomain = process.env.RESEND_FROM_DOMAIN ?? 'navhub.co'
      const safeMsg    = message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
      await resend.emails.send({
        from:    `NavHub <notifications@${fromDomain}>`,
        to:      toEmail,
        subject: 'A response to your NavHub feedback',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;color:#222">
            <p style="margin:0 0 12px">Thanks again for your feedback. Here's what we've decided:</p>
            <div style="margin:12px 0;padding:12px;background:#f6f7fa;border-left:3px solid #6366f1;color:#333">
              ${safeMsg}
            </div>
            <p style="margin:24px 0 0;font-size:12px;color:#888">Reference: ${params.id}</p>
          </div>
        `,
      })
    } catch (err) {
      console.error('[suggestions/notify] Resend failed:', err)
    }
  }

  const updates: Record<string, unknown> = { user_notified_at: new Date().toISOString() }
  if (newStatus) updates.status = newStatus
  const { error: updErr } = await admin
    .from('user_suggestions')
    .update(updates)
    .eq('id', params.id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ data: { id: params.id, sent_to: toEmail } })
}
