import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  // Fetch document and verify ownership
  const { data: doc, error: docErr } = await admin
    .from('documents')
    .select('id, group_id, file_path, file_name, file_type')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .eq('is_active', true)
    .single()

  if (docErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (!doc.file_path) {
    return NextResponse.json({ error: 'Document has no uploaded file' }, { status: 400 })
  }

  // Get signed URL
  const { data: urlData, error: urlErr } = await admin.storage
    .from('documents')
    .createSignedUrl(doc.file_path as string, 60)

  if (urlErr || !urlData?.signedUrl) {
    return NextResponse.json({ error: 'Could not access file' }, { status: 500 })
  }

  // Fetch the file
  const fileRes = await fetch(urlData.signedUrl)
  if (!fileRes.ok) {
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  const fileName = (doc.file_name as string) ?? ''
  const fileType = (doc.file_type as string) ?? ''
  const isImage  = /\.(png|jpg|jpeg)$/i.test(fileName) || /^image\//i.test(fileType)

  let extractedText = ''

  if (isImage) {
    const buffer = await fileRes.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mediaType = fileType.startsWith('image/') ? fileType : 'image/jpeg'

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role:    'user',
          content: [
            {
              type:   'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: 'Describe the contents of this image in detail. Extract any visible text.',
            },
          ],
        }],
      }),
    })

    if (res.ok) {
      const msg = await res.json() as { content: { type: string; text?: string }[] }
      extractedText = msg.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('')
    }
  } else {
    // Text-based files: try UTF-8 decode first
    const isTextFile = /\.(txt|md|html|csv)$/i.test(fileName)

    if (isTextFile) {
      extractedText = await fileRes.text()
    } else {
      // For PDF, DOCX, XLSX, PPTX — pass as base64 to Claude
      const buffer = await fileRes.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          messages: [{
            role:    'user',
            content: [
              {
                type:   'document',
                source: { type: 'base64', media_type: fileType || 'application/octet-stream', data: base64 },
              },
              {
                type: 'text',
                text: 'Extract and summarise the key content of this document in markdown format. Preserve headings, lists, and important data.',
              },
            ],
          }],
        }),
      })

      if (res.ok) {
        const msg = await res.json() as { content: { type: string; text?: string }[] }
        extractedText = msg.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('')
      }
    }
  }

  if (!extractedText) {
    return NextResponse.json({ error: 'Could not extract content from file' }, { status: 422 })
  }

  // Save to content_markdown
  const { error: updateErr } = await admin
    .from('documents')
    .update({ content_markdown: extractedText })
    .eq('id', params.id)

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to save extracted content' }, { status: 500 })
  }

  return NextResponse.json({ data: { success: true } })
}
