import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'
import { renderTemplate, validateSlots } from '@/lib/template-renderer'
import type { ReportTemplate } from '@/lib/types'

export const runtime = 'nodejs'

// ─── POST /api/report-templates/[id]/generate ────────────────────────────────
// Render template → upload to report-files Storage → insert custom_reports record

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const { data: template, error: tmplErr } = await supabase
    .from('report_templates')
    .select('*')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()

  if (tmplErr || !template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  let body: { slot_data?: Record<string, unknown>; report_name?: string; notes?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { slot_data = {}, report_name, notes } = body
  if (!report_name) {
    return NextResponse.json({ error: 'report_name is required' }, { status: 400 })
  }

  const typedTemplate = template as ReportTemplate
  const validation    = validateSlots(typedTemplate.slots, slot_data)
  if (!validation.valid) {
    return NextResponse.json({
      error:         'Required slots are missing',
      missing_slots: validation.missing,
    }, { status: 422 })
  }

  const html = renderTemplate(typedTemplate, slot_data)

  // Upload HTML to Supabase Storage (report-files bucket)
  const admin     = createAdminClient()
  const timestamp = Date.now()
  const safeName  = report_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
  const storagePath = `${activeGroupId}/reports/${timestamp}_${safeName}.html`

  const { error: uploadErr } = await admin.storage
    .from('report-files')
    .upload(storagePath, Buffer.from(html, 'utf-8'), {
      contentType: 'text/html',
      upsert: false,
    })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  // Insert into custom_reports
  const { data: report, error: insertErr } = await admin
    .from('custom_reports')
    .insert({
      group_id:    activeGroupId,
      name:        report_name,
      description: notes ?? null,
      file_path:   storagePath,
      file_type:   'html',
      uploaded_by: session.user.id,
      is_active:   true,
      sort_order:  0,
      template_id: params.id,
      slot_data,
      updated_at:  new Date().toISOString(),
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json({ data: report }, { status: 201 })
}
