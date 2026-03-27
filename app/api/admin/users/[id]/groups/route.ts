import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    // Verify caller is super_admin
    const { data: callerRole } = await admin
      .from('user_groups')
      .select('role')
      .eq('user_id', session.user.id)
      .eq('role', 'super_admin')
      .limit(1)
    if (!callerRole?.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json() as { group_id: string; role: string }
    const { group_id, role } = body
    if (!group_id || !role) return NextResponse.json({ error: 'group_id and role required' }, { status: 400 })

    // Fetch user email before upsert
    const { data: { user } } = await admin.auth.admin.getUserById(params.id)
    const userEmail = user?.email
    if (!userEmail) {
      return NextResponse.json({ error: 'User email not found' }, { status: 404 })
    }

    // Fetch group name before upsert
    const { data: group } = await admin
      .from('groups')
      .select('name')
      .eq('id', group_id)
      .single()
    const groupName = group?.name ?? 'a new group'

    // Upsert into user_groups
    const { data: membership, error } = await admin
      .from('user_groups')
      .upsert({
        user_id: params.id,
        group_id,
        role,
        is_default: false,
      }, { onConflict: 'user_id,group_id' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Send email via Resend SDK
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from:    `NavHub <invites@navhub.co>`,
          to:      userEmail,
          subject: `You've been added to ${groupName} on NavHub`,
          html: `
            <h2>You've been added to a new group</h2>
            <p>Hi,</p>
            <p>You now have access to <strong>${groupName}</strong> on NavHub with the role <strong>${role}</strong>.</p>
            <p>Log in to NavHub and use the group switcher in the top right to access this group.</p>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/landing">Open NavHub</a></p>
            <p>If you have any questions, contact your administrator.</p>
          `
        })
      } catch (emailErr) {
        console.error('Failed to send group addition email:', emailErr)
        // Don't fail the request if email fails
      }
    }

    return NextResponse.json({ success: true, membership })
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
