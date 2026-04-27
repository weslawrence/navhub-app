import { NextResponse }     from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET  /api/admin/assistant-config/documents?group_id=...
 *   → lists knowledge docs scoped to the platform (no group_id) or to a group.
 *
 * POST /api/admin/assistant-config/documents
 *   JSON  { document_id, group_id? }   — link an existing NavHub document
 *   multipart  file + group_id?        — upload a new file to Storage
 *
 * super_admin only.
 */

export const runtime = 'nodejs'

async function isSuperAdmin(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
    .limit(1)
  return !!data && data.length > 0
}

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isSuperAdmin(supabase, session.user.id))) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 })
  }

  const url     = new URL(req.url)
  const groupId = url.searchParams.get('group_id')

  const admin = createAdminClient()
  const query = admin
    .from('assistant_knowledge_documents')
    .select('id, group_id, document_id, file_path, file_name, file_type, created_at, documents(title)')
    .order('created_at', { ascending: false })

  const { data, error } = groupId
    ? await query.eq('group_id', groupId)
    : await query.is('group_id', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = (data ?? []).map(d => ({
    id:             d.id,
    group_id:       d.group_id,
    document_id:    d.document_id,
    file_path:      d.file_path,
    file_name:      d.file_name,
    file_type:      d.file_type,
    created_at:     d.created_at,
    document_title: (d.documents as { title?: string } | null)?.title ?? null,
  }))

  return NextResponse.json({ data: enriched })
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isSuperAdmin(supabase, session.user.id))) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 })
  }

  const admin       = createAdminClient()
  const contentType = req.headers.get('content-type') ?? ''

  // ── Path 1: link existing document ───────────────────────────────────────
  if (contentType.includes('application/json')) {
    const body = await req.json() as { document_id?: string; group_id?: string | null }
    if (!body.document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

    const { data: doc } = await admin
      .from('documents')
      .select('id, title, file_type, file_name')
      .eq('id', body.document_id)
      .maybeSingle()
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const { data, error } = await admin
      .from('assistant_knowledge_documents')
      .insert({
        group_id:    body.group_id ?? null,
        document_id: doc.id,
        file_name:   doc.file_name ?? doc.title,
        file_type:   doc.file_type ?? 'text/markdown',
      })
      .select('id, group_id, document_id, file_path, file_name, file_type, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: { ...data, document_title: doc.title } }, { status: 201 })
  }

  // ── Path 2: upload new file ──────────────────────────────────────────────
  const formData = await req.formData()
  const file     = formData.get('file') as File | null
  const groupId  = (formData.get('group_id') as string | null) || null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const safeName = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_')
  const folder   = groupId ?? '_platform'
  const filePath = `${folder}/assistant-knowledge/${Date.now()}_${safeName}`
  const buffer   = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from('documents')
    .upload(filePath, buffer, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data, error } = await admin
    .from('assistant_knowledge_documents')
    .insert({
      group_id:  groupId,
      file_path: filePath,
      file_name: file.name,
      file_type: file.type || 'application/octet-stream',
    })
    .select('id, group_id, document_id, file_path, file_name, file_type, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
