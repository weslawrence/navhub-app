import { NextResponse }  from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies }      from 'next/headers'

export const runtime = 'nodejs'

// ─── GET /api/report-templates/[id]/versions/[versionId] ────────────────────
// Full version record including scaffold content

export async function GET(
  _request: Request,
  { params }: { params: { id: string; versionId: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Verify template belongs to active group
  const { data: tpl } = await supabase
    .from('report_templates')
    .select('id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('report_template_versions')
    .select('*')
    .eq('id', params.versionId)
    .eq('template_id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Version not found' }, { status: 404 })
  return NextResponse.json({ data })
}
