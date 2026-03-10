import { NextResponse }  from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies }      from 'next/headers'

export const runtime = 'nodejs'

// ─── GET /api/report-templates/[id]/versions ──────────────────────────────────
// List version history (no scaffold content for performance)

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
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
    .select('id, template_id, version, saved_by, created_at')
    .eq('template_id', params.id)
    .order('version', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
