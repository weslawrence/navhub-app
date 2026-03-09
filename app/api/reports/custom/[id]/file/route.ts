import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET /api/reports/custom/[id]/file ───────────────────────────────────────
// Returns a signed URL for the report file (valid 1 hour).
// Any group member can access.

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  // Fetch report — RLS ensures user can only read their group's reports
  const { data: report } = await supabase
    .from('custom_reports')
    .select('file_path, name, group_id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .eq('is_active', true)
    .single()

  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data: signedData, error } = await admin.storage
    .from('report-files')
    .createSignedUrl(report.file_path, 3600, {
      download: false,
    })

  if (error || !signedData?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to generate signed URL' },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: { url: signedData.signedUrl, name: report.name } })
}
