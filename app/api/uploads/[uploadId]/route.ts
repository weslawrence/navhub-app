import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'

export const runtime = 'nodejs'

// ─── DELETE /api/uploads/[uploadId] ──────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: { uploadId: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Verify the upload belongs to the active group by checking its company
  const { data: upload } = await supabase
    .from('excel_uploads')
    .select('id, company_id, division_id, companies!left(group_id), divisions!left(company_id, companies!inner(group_id))')
    .eq('id', params.uploadId)
    .single()

  if (!upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
  }

  // Simple group check — verify via company
  if (activeGroupId) {
    const uploadGroupId = (upload as unknown as { companies?: { group_id: string } }).companies?.group_id
    if (uploadGroupId && uploadGroupId !== activeGroupId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('excel_uploads')
    .delete()
    .eq('id', params.uploadId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: { id: params.uploadId } })
}
