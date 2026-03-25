import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Verify caller is super_admin
  const { data: membership } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .limit(1)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Resolve target user's email
  const { data: targetUser, error: userErr } = await admin.auth.admin.getUserById(params.id)
  if (userErr || !targetUser?.user?.email) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Generate a password recovery link for the target user
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: targetUser.user.email,
  })

  if (linkErr) {
    return NextResponse.json({ error: linkErr.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      reset_link: linkData?.properties?.action_link ?? null,
      email: targetUser.user.email,
    }
  })
}
