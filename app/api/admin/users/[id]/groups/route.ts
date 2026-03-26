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

    const { group_id, role } = await request.json() as { group_id: string; role: string }
    if (!group_id || !role) return NextResponse.json({ error: 'group_id and role required' }, { status: 400 })

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

    // Get group name for notification
    const { data: group } = await admin
      .from('groups')
      .select('name')
      .eq('id', group_id)
      .single()

    // Get user email for notification
    const { data: { user } } = await admin.auth.admin.getUserById(params.id)

    // Send Resend notification if configured
    if (user?.email && process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `NavHub <invites@${process.env.RESEND_FROM_DOMAIN ?? 'navhub.co'}>`,
            to: user.email,
            subject: `You've been added to a new group on NavHub`,
            html: `<h2>You've been added to a new group</h2><p>You now have access to <strong>${group?.name ?? 'a new group'}</strong> as <strong>${role}</strong>.</p><p>Log in to NavHub and use the group switcher to access this group.</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL}/landing">Open NavHub</a></p>`,
          }),
        })
      } catch {
        // Email failure is non-fatal
      }
    }

    return NextResponse.json({ success: true, membership })
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
