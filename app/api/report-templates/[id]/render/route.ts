import { NextResponse }    from 'next/server'
import { createClient }   from '@/lib/supabase/server'
import { cookies }        from 'next/headers'
import { renderTemplate, validateSlots } from '@/lib/template-renderer'
import type { ReportTemplate } from '@/lib/types'

export const runtime = 'nodejs'

// ─── POST /api/report-templates/[id]/render ──────────────────────────────────
// Preview render — returns HTML string. Does NOT save to Storage.

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: template, error: tmplErr } = await supabase
    .from('report_templates')
    .select('*')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()

  if (tmplErr || !template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  let body: { slot_data?: Record<string, unknown> }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const slotData = body.slot_data ?? {}
  const validation = validateSlots((template as ReportTemplate).slots, slotData)

  const html = renderTemplate(template as ReportTemplate, slotData)

  return NextResponse.json({
    data: {
      html,
      missing_slots: validation.missing,
      valid:         validation.valid,
    }
  })
}
