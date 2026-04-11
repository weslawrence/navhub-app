import { NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserPermissions } from '@/lib/permissions'
import type { AppRole, FeatureKey, AccessLevel } from '@/lib/types'

// ─── PUT — super admin: replace all permissions for a user in a group ────────

export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Verify caller is super_admin
  const { data: callerCheck } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('role', 'super_admin')
    .limit(1)

  if (!callerCheck || callerCheck.length === 0) {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
  }

  let body: {
    group_id: string
    permissions: Array<{ feature: FeatureKey; company_id: string | null; access: AccessLevel }>
  }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.group_id || !Array.isArray(body.permissions)) {
    return NextResponse.json({ error: 'group_id and permissions array required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Get target user role
  const { data: targetMembership } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', params.id)
    .eq('group_id', body.group_id)
    .single()

  if (!targetMembership) return NextResponse.json({ error: 'User not found in group' }, { status: 404 })

  // Delete existing permissions
  await admin
    .from('user_permissions')
    .delete()
    .eq('user_id', params.id)
    .eq('group_id', body.group_id)

  // Insert new permissions (filter out 'none')
  const rows = body.permissions
    .filter(p => p.access !== 'none')
    .map(p => ({
      user_id:    params.id,
      group_id:   body.group_id,
      feature:    p.feature,
      company_id: p.company_id,
      access:     p.access,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    }))

  if (rows.length > 0) {
    const { error } = await admin.from('user_permissions').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const matrix = await getUserPermissions(params.id, body.group_id, targetMembership.role as AppRole)
  return NextResponse.json({ data: { matrix } })
}
