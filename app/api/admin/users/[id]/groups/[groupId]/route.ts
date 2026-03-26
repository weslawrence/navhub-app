import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; groupId: string } }
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: callerRole } = await admin
      .from('user_groups')
      .select('role')
      .eq('user_id', session.user.id)
      .eq('role', 'super_admin')
      .limit(1)
    if (!callerRole?.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json() as { role?: string; is_default?: boolean }
    const updates: Record<string, unknown> = {}
    if (body.role !== undefined) updates.role = body.role
    if (body.is_default === true) {
      // Clear all other defaults for this user first
      await admin.from('user_groups').update({ is_default: false }).eq('user_id', params.id)
      updates.is_default = true
    }

    const { data, error } = await admin
      .from('user_groups')
      .update(updates)
      .eq('user_id', params.id)
      .eq('group_id', params.groupId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, membership: data })
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; groupId: string } }
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: callerRole } = await admin
      .from('user_groups')
      .select('role')
      .eq('user_id', session.user.id)
      .eq('role', 'super_admin')
      .limit(1)
    if (!callerRole?.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Check if this is the user's default group
    const { data: existing } = await admin
      .from('user_groups')
      .select('is_default')
      .eq('user_id', params.id)
      .eq('group_id', params.groupId)
      .single()

    // Delete the membership
    const { error } = await admin
      .from('user_groups')
      .delete()
      .eq('user_id', params.id)
      .eq('group_id', params.groupId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // If this was their default, set another group as default if one exists
    if (existing?.is_default) {
      const { data: remaining } = await admin
        .from('user_groups')
        .select('group_id')
        .eq('user_id', params.id)
        .limit(1)
      if (remaining?.length) {
        await admin
          .from('user_groups')
          .update({ is_default: true })
          .eq('user_id', params.id)
          .eq('group_id', remaining[0].group_id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : JSON.stringify(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
