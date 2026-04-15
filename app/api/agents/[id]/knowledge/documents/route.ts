import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET — list knowledge documents with joined document title ──────────────

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_knowledge_documents')
    .select('id, agent_id, document_id, file_path, file_name, file_type, file_size, created_at, documents(title)')
    .eq('agent_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = (data ?? []).map(d => {
    const doc = d.documents as { title: string } | { title: string }[] | null
    const title = Array.isArray(doc) ? doc[0]?.title : doc?.title ?? null
    return { ...d, document_title: title, documents: undefined }
  })

  return NextResponse.json({ data: enriched })
}

// ─── POST — link existing document or upload file ───────────────────────────

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const contentType = request.headers.get('content-type') ?? ''
  const admin = createAdminClient()

  // Verify agent belongs to group
  const { data: agent } = await admin
    .from('agents')
    .select('id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  if (contentType.includes('multipart/form-data')) {
    // Upload file mode
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File required' }, { status: 400 })

    const filePath = `${activeGroupId}/agent-knowledge/${params.id}/${Date.now()}-${file.name}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await admin.storage
      .from('documents')
      .upload(filePath, buffer, { contentType: file.type })

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

    const { data, error } = await admin
      .from('agent_knowledge_documents')
      .insert({
        agent_id:  params.id,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  }

  // JSON mode — link existing document
  const body = await request.json() as { document_id?: string }
  if (!body.document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

  // Look up the document to get file info
  const { data: doc } = await admin
    .from('documents')
    .select('id, title, file_name, file_type, file_path')
    .eq('id', body.document_id)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data, error } = await admin
    .from('agent_knowledge_documents')
    .insert({
      agent_id:    params.id,
      document_id: doc.id,
      file_name:   doc.file_name ?? doc.title ?? 'document',
      file_type:   doc.file_type ?? null,
      file_path:   doc.file_path ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
