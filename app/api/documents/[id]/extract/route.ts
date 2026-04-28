import { NextResponse }     from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractDocumentText } from '@/lib/document-extract'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()

  const { data: doc, error: docErr } = await admin
    .from('documents')
    .select('id, group_id, file_path, file_name, file_type')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .eq('is_active', true)
    .single()

  if (docErr || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if (!doc.file_path) return NextResponse.json({ error: 'Document has no uploaded file' }, { status: 400 })

  const { data: fileData, error: dlErr } = await admin.storage
    .from('documents')
    .download(doc.file_path as string)

  if (dlErr || !fileData) return NextResponse.json({ error: 'Could not access file' }, { status: 500 })

  const buffer        = Buffer.from(await fileData.arrayBuffer())
  const extractedText = await extractDocumentText(
    (doc.file_name as string) ?? '',
    (doc.file_type as string) ?? '',
    buffer,
  )

  if (!extractedText.trim()) {
    return NextResponse.json({ error: 'Could not extract content from file' }, { status: 422 })
  }

  const { error: updateErr } = await admin
    .from('documents')
    .update({ content_markdown: extractedText })
    .eq('id', params.id)

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to save extracted content' }, { status: 500 })
  }

  return NextResponse.json({ data: { success: true, length: extractedText.length } })
}
