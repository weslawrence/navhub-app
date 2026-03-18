import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { GroupInvite }  from '@/lib/types'
import { Resend }            from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// ─── GET/POST /api/groups/[id]/invites ────────────────────────────────────────
// POST sends an email:
//   • New user  → Supabase magic-link invite (→ /accept-invite) + Resend notification
//   • Existing  → Resend notification + immediately adds to group
// Body: { email: string, role: string }

const ADMIN_ROLES     = ['super_admin', 'group_admin']
const INVITABLE_ROLES = ['group_admin', 'company_viewer', 'division_viewer']

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (params.id !== activeGroupId) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', params.id)
    .single()

  if (!membership || !ADMIN_ROLES.includes(membership.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: invites, error } = await admin
    .from('group_invites')
    .select('*')
    .eq('group_id', params.id)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: (invites ?? []) as GroupInvite[] })
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (params.id !== activeGroupId) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', params.id)
    .single()

  if (!membership || !ADMIN_ROLES.includes(membership.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role  = typeof body.role  === 'string' ? body.role  : ''

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }
  if (!INVITABLE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${INVITABLE_ROLES.join(', ')}` },
      { status: 422 }
    )
  }

  const admin = createAdminClient()

  // Fetch the group name for email copy
  const { data: group } = await admin
    .from('groups')
    .select('name')
    .eq('id', params.id)
    .single()

  const groupName  = group?.name ?? 'a NavHub group'
  const roleLabel  = role.replace(/_/g, ' ')
  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.navhub.co'
  const fromDomain = process.env.RESEND_FROM_DOMAIN   ?? 'navhub.co'

  // Record the invite in DB
  const { data: invite, error: inviteErr } = await admin
    .from('group_invites')
    .upsert(
      { group_id: params.id, email, role, invited_by: session.user.id },
      { onConflict: 'group_id,email', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 500 })
  }

  // ── Does this email already have a Supabase account? ───────────────────────
  const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existingUser = userList?.users.find(u => u.email === email)

  if (!existingUser) {
    // ── NEW user — send Supabase magic-link invite email ──────────────────────
    const redirectTo =
      `${appUrl}/accept-invite?group_id=${params.id}&role=${encodeURIComponent(role)}`

    const { error: supabaseErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { group_id: params.id, role, invited_by: session.user.id },
    })

    if (supabaseErr) {
      // Non-fatal — invite record saved; log error
      console.error('[invite] Supabase invite error:', supabaseErr.message)
    }

    // Also send a Resend notification so the invitee knows which group they're joining
    void resend.emails.send({
      from:    `NavHub <invites@${fromDomain}>`,
      to:      email,
      subject: `You've been invited to join ${groupName} on NavHub`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
          <h2 style="margin:0 0 8px">You've been invited to <strong>${groupName}</strong></h2>
          <p style="margin:0 0 16px;color:#555">
            You've been invited to join <strong>${groupName}</strong> on NavHub as
            <strong>${roleLabel}</strong>. Check your inbox for a separate email with a
            link to set your password and activate your account.
          </p>
          <p style="margin-top:24px;font-size:12px;color:#aaa">
            If you weren't expecting this, you can safely ignore this email.
          </p>
        </div>
      `,
    })
  } else {
    // ── EXISTING user — add immediately + send notification ───────────────────

    // Determine is_default (first group for this user)
    const { count } = await admin
      .from('user_groups')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', existingUser.id)

    await admin.from('user_groups').upsert(
      {
        user_id:    existingUser.id,
        group_id:   params.id,
        role,
        is_default: (count ?? 0) === 0,
      },
      { onConflict: 'user_id,group_id' }
    )

    // Mark invite accepted
    void admin
      .from('group_invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    // Notification email
    void resend.emails.send({
      from:    `NavHub <invites@${fromDomain}>`,
      to:      email,
      subject: `You've been added to ${groupName} on NavHub`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
          <h2 style="margin:0 0 8px">You've been added to <strong>${groupName}</strong></h2>
          <p style="margin:0 0 16px;color:#555">
            You now have access to <strong>${groupName}</strong> on NavHub with the role
            <strong>${roleLabel}</strong>.
          </p>
          <a href="${appUrl}/dashboard"
             style="display:inline-block;padding:10px 20px;background:#0ea5e9;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Open NavHub
          </a>
          <p style="margin-top:24px;font-size:12px;color:#aaa">
            If you weren't expecting this, you can safely ignore this email.
          </p>
        </div>
      `,
    })
  }

  return NextResponse.json({ data: invite as GroupInvite }, { status: 201 })
}
