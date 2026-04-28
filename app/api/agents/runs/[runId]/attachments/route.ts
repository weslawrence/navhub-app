import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractDocumentText } from '@/lib/document-extract'

export const runtime     = 'nodejs'
export const maxDuration = 60

// GET — list attachments for a run
export async function GET(
  _request: Request,
  { params }: { params: { runId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()

  // Verify run belongs to active group
  const { data: run } = await admin
    .from('agent_runs')
    .select('id')
    .eq('id', params.runId)
    .eq('group_id', activeGroupId)
    .single()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const { data: attachments, error } = await admin
    .from('agent_run_attachments')
    .select('id, run_id, file_name, file_type, file_size, created_at')
    .eq('run_id', params.runId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: attachments ?? [] })
}

// POST — upload a file attachment for a run
export async function POST(
  request: Request,
  { params }: { params: { runId: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()

  // Verify run belongs to active group
  const { data: run } = await admin
    .from('agent_runs')
    .select('id')
    .eq('id', params.runId)
    .eq('group_id', activeGroupId)
    .single()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const storagePath = `${activeGroupId}/agent-runs/${params.runId}/attachments/${file.name}`
  const buffer      = Buffer.from(await file.arrayBuffer())
  const contentType = file.type || 'application/octet-stream'

  // Upload to storage bucket 'agent-runs'
  const { error: storageErr } = await admin.storage
    .from('agent-runs')
    .upload(storagePath, buffer, { contentType, upsert: true })

  if (storageErr) {
    return NextResponse.json({ error: `Storage upload failed: ${storageErr.message}` }, { status: 500 })
  }

  // Auto-extract text content so read_attachment can serve it instantly
  // without re-downloading from Storage on every tool call.
  let contentText = ''
  try {
    contentText = await extractDocumentText(file.name, contentType, buffer)
  } catch (err) {
    console.error('[attachments] extract failed:', err)
  }

  // Insert into agent_run_attachments
  const { data: attachment, error: dbErr } = await admin
    .from('agent_run_attachments')
    .insert({
      run_id:       params.runId,
      file_path:    storagePath,
      file_name:    file.name,
      file_type:    contentType,
      file_size:    file.size,
      content_text: contentText || null,
    })
    .select()
    .single()

  if (dbErr) {
    void admin.storage.from('agent-runs').remove([storagePath])
    return NextResponse.json({ error: `DB insert failed: ${dbErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ data: attachment }, { status: 201 })
}
