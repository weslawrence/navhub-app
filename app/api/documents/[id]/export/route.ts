import { NextResponse }     from 'next/server'
import { cookies }          from 'next/headers'
import { createClient }     from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  exportToDocx,
  exportToPptx,
  exportToPdfHtml,
} from '@/lib/document-export'
import type { Document } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value ?? ''

  // ── Fetch document (server client enforces RLS / group membership) ────────
  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // ── Fetch group name ──────────────────────────────────────────────────────
  const admin = createAdminClient()
  const { data: grp } = await admin
    .from('groups')
    .select('name')
    .eq('id', activeGroupId)
    .single()
  const groupName = (grp as { name: string } | null)?.name ?? ''

  // ── Format ────────────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format') ?? 'docx'

  // Sanitise filename
  const safeName = (doc as Document).title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'document'

  try {
    if (format === 'docx') {
      const buffer = await exportToDocx(doc as Document, groupName)
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${safeName}.docx"`,
        },
      })
    }

    if (format === 'pptx') {
      const buffer = await exportToPptx(doc as Document, groupName)
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type':        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename="${safeName}.pptx"`,
        },
      })
    }

    if (format === 'pdf') {
      const html = exportToPdfHtml(doc as Document, groupName)
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      })
    }

    return NextResponse.json({ error: 'Invalid format. Use docx, pptx, or pdf.' }, { status: 400 })
  } catch (err) {
    console.error('[document export]', err)
    return NextResponse.json(
      { error: 'Export failed. Please try again.' },
      { status: 500 }
    )
  }
}
