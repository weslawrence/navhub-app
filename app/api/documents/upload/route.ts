import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DocumentType } from '@/lib/types'

const ALLOWED_TYPES: Record<string, string> = {
  '.pdf':  'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc':  'application/msword',
  '.txt':  'text/plain',
  '.md':   'text/markdown',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls':  'application/vnd.ms-excel',
  '.csv':  'text/csv',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt':  'application/vnd.ms-powerpoint',
  '.html': 'text/html',
}

function getAllowedExtension(filename: string): string | null {
  const lower = filename.toLowerCase()
  const ext = Object.keys(ALLOWED_TYPES).find(e => lower.endsWith(e))
  return ext ?? null
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file      = formData.get('file') as File | null
  const folderId  = formData.get('folder_id') as string | null
  const titleInput = formData.get('title') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = getAllowedExtension(file.name)
  if (!ext) {
    return NextResponse.json({
      error: `File type not allowed. Accepted: ${Object.keys(ALLOWED_TYPES).join(', ')}`,
    }, { status: 400 })
  }

  const contentType = ALLOWED_TYPES[ext] ?? file.type
  const title = titleInput?.trim() || file.name.replace(/\.[^.]+$/, '')
  const docId = crypto.randomUUID()
  const storagePath = `${activeGroupId}/documents/${docId}/${file.name}`

  const admin = createAdminClient()

  // Upload to storage
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: storageErr } = await admin.storage
    .from('documents')
    .upload(storagePath, buffer, { contentType, upsert: false })

  if (storageErr) {
    return NextResponse.json({ error: `Storage upload failed: ${storageErr.message}` }, { status: 500 })
  }

  // Insert document record
  const { data: doc, error: dbErr } = await admin
    .from('documents')
    .insert({
      id:               docId,
      group_id:         activeGroupId,
      folder_id:        folderId ?? null,
      title,
      document_type:    'financial_analysis' as DocumentType,
      audience:         'internal',
      content_markdown: '',
      status:           'published',
      upload_source:    'uploaded',
      file_path:        storagePath,
      file_name:        file.name,
      file_size:        file.size,
      file_type:        contentType,
      created_by:       user.id,
    })
    .select()
    .single()

  if (dbErr) {
    // Try to clean up storage
    void admin.storage.from('documents').remove([storagePath])
    return NextResponse.json({ error: `DB insert failed: ${dbErr.message}` }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      document_id: docId,
      title,
      file_path: storagePath,
      document: doc,
    },
  }, { status: 201 })
}
