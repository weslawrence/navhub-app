import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── DELETE /api/reports/custom/[id] ─────────────────────────────────────────
// Soft-deletes the report record + hard-deletes the Storage file.
// Requires group_admin or super_admin role.

const ADMIN_ROLES = ['super_admin', 'group_admin']

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  // Verify admin role
  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', activeGroupId)
    .single()

  if (!membership || !ADMIN_ROLES.includes(membership.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Fetch the report to get file_path and verify group ownership
  const { data: report } = await supabase
    .from('custom_reports')
    .select('file_path, group_id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)  // RLS + explicit group check
    .single()

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  const admin = createAdminClient()

  // Soft-delete the DB record
  const { error: dbError } = await admin
    .from('custom_reports')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  // Hard-delete from Storage (best-effort — don't fail the response on storage error)
  await admin.storage.from('report-files').remove([report.file_path])

  return NextResponse.json({ data: { id: params.id } })
}
