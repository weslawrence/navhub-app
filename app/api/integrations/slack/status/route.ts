import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET — return Slack connection status for active group ──────────────────

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const configured = !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET)

  const admin = createAdminClient()
  const { data } = await admin
    .from('slack_connections')
    .select('id, team_id, team_name, is_active, created_at')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)
    .maybeSingle()

  return NextResponse.json({ data: data ?? null, configured })
}

// ─── DELETE — soft disconnect ───────────────────────────────────────────────

export async function DELETE() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', activeGroupId)
    .single()
  const isAdmin = membership?.role === 'super_admin' || membership?.role === 'group_admin'
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const admin = createAdminClient()
  await admin.from('slack_connections').update({ is_active: false }).eq('group_id', activeGroupId)

  return NextResponse.json({ data: { disconnected: true } })
}
