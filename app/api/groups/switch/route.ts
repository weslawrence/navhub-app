import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { group_id } = await request.json() as { group_id: string }
    if (!group_id) return NextResponse.json({ error: 'group_id required' }, { status: 400 })

    const admin = createAdminClient()

    // Verify user is a member of the group
    const { data: membership } = await admin
      .from('user_groups')
      .select('group_id, role')
      .eq('user_id', session.user.id)
      .eq('group_id', group_id)
      .single()

    if (!membership) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

    // Set active_group_id cookie
    const cookieStore = cookies()
    cookieStore.set('active_group_id', group_id, {
      httpOnly: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
