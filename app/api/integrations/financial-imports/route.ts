import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET — list financial imports for active group ──────────────────────────

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('financial_imports')
    .select('id, group_id, company_id, document_id, file_name, file_path, data_type, period, status, error_message, created_at')
    .eq('group_id', activeGroupId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ─── POST — upload financial data file and create import record ─────────────

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const formData = await request.formData()
  const file       = formData.get('file')        as File | null
  const companyId  = formData.get('company_id')  as string | null
  const dataType   = formData.get('data_type')   as string | null
  const period     = formData.get('period')      as string | null
  const folderId   = formData.get('folder_id')   as string | null

  if (!file) return NextResponse.json({ error: 'File is required' }, { status: 400 })
  if (!dataType || !['pl', 'balance_sheet', 'cash_flow', 'custom'].includes(dataType)) {
    return NextResponse.json({ error: 'Invalid data_type' }, { status: 422 })
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 25MB)' }, { status: 422 })
  }

  const admin = createAdminClient()

  // Resolve target folder — caller can override; otherwise use Imports system folder
  let targetFolderId = folderId
  if (!targetFolderId) {
    const { data: importsFolder } = await admin
      .from('document_folders')
      .select('id')
      .eq('group_id', activeGroupId)
      .eq('folder_type', 'imports')
      .maybeSingle()
    targetFolderId = importsFolder?.id ?? null
  }

  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const timestamp = Date.now()
  const filePath  = `${activeGroupId}/imports/${timestamp}_${safeName}`
  const buffer    = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await admin.storage
    .from('documents')
    .upload(filePath, buffer, { contentType: file.type || 'application/octet-stream' })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  // Create a document record in the Imports folder
  const title = `${file.name}${period ? ' — ' + period : ''}`
  const { data: doc, error: docErr } = await admin
    .from('documents')
    .insert({
      group_id:         activeGroupId,
      company_id:       companyId || null,
      folder_id:        targetFolderId,
      title,
      document_type:    'financial_analysis',
      audience:         'internal',
      status:           'draft',
      content_markdown: '',
      upload_source:    'uploaded',
      file_path:        filePath,
      file_name:        file.name,
      file_size:        file.size,
      file_type:        file.type || null,
      created_by:       session.user.id,
    })
    .select('id')
    .single()

  if (docErr) {
    // Clean up storage on failure
    void admin.storage.from('documents').remove([filePath])
    return NextResponse.json({ error: docErr.message }, { status: 500 })
  }

  // Create the financial_imports record
  const { data: imp, error: impErr } = await admin
    .from('financial_imports')
    .insert({
      group_id:     activeGroupId,
      company_id:   companyId || null,
      document_id:  doc.id,
      file_name:    file.name,
      file_path:    filePath,
      data_type:    dataType,
      period:       period || null,
      status:       'pending',
      imported_by:  session.user.id,
    })
    .select()
    .single()

  if (impErr) return NextResponse.json({ error: impErr.message }, { status: 500 })

  return NextResponse.json({ data: imp }, { status: 201 })
}
