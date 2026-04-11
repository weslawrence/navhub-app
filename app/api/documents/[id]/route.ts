import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getValidSharePointToken,
  ensureSharePointFolder,
  uploadFileToSharePoint,
} from '@/lib/sharepoint'
import { exportToDocx } from '@/lib/document-export'
import type { Document } from '@/lib/types'

// ─── GET — single document ──────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  return NextResponse.json({ data })
}

// ─── PATCH — update document ────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  // Verify ownership via RLS
  const { data: existing } = await supabase
    .from('documents')
    .select('id, content_markdown')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const admin = createAdminClient()

  // Auto-version if content is changing
  if (body.content_markdown !== undefined && body.content_markdown !== existing.content_markdown) {
    // Count existing versions to determine next version number
    const { count } = await admin
      .from('document_versions')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', params.id)

    void admin.from('document_versions').insert({
      document_id:      params.id,
      content_markdown: existing.content_markdown,
      version:          (count ?? 0) + 1,
      created_by:       session.user.id,
    })
  }

  // Sanitise tags if provided
  if (Array.isArray(body.tags)) {
    body.tags = (body.tags as string[])
      .map((t: string) => String(t).toLowerCase().trim().slice(0, 40))
      .filter((t: string) => t.length > 0)
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
  }

  const allowedFields = [
    'title', 'document_type', 'audience', 'content_markdown',
    'status', 'folder_id', 'company_id', 'locked_by', 'locked_at', 'tags',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await admin
    .from('documents')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-sync to SharePoint if content changed and connection is active (fire-and-forget)
  if (body.content_markdown !== undefined && body.content_markdown !== existing.content_markdown && activeGroupId) {
    void (async () => {
      try {
        const { data: conn } = await admin
          .from('sharepoint_connections')
          .select('*')
          .eq('group_id', activeGroupId)
          .eq('is_active', true)
          .maybeSingle()

        if (!conn || !conn.drive_id) return

        const { access_token }    = await getValidSharePointToken(conn.id)
        const { data: groupData } = await admin.from('groups').select('name').eq('id', activeGroupId).single()
        const groupName           = groupData?.name ?? 'NavHub'
        const docxBuffer          = await exportToDocx(data as Document, groupName)
        const folderPath          = conn.folder_path ?? 'NavHub/Documents'
        const folderId            = await ensureSharePointFolder(access_token, conn.drive_id, folderPath)
        const safeName            = (data.title as string).replace(/[^a-zA-Z0-9 \-_]/g, '').trim() || 'Document'
        const filename            = `${safeName}.docx`

        const uploaded = await uploadFileToSharePoint(
          access_token, conn.drive_id, folderId, filename, docxBuffer,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )

        void admin.from('document_sharepoint_sync').upsert({
          document_id:        params.id,
          connection_id:      conn.id,
          sharepoint_item_id: uploaded.id,
          sharepoint_url:     uploaded.webUrl,
          last_synced_at:     new Date().toISOString(),
          sync_status:        'synced',
        }, { onConflict: 'document_id' })
      } catch (err) {
        console.error('SharePoint auto-sync error:', err)
      }
    })()
  }

  return NextResponse.json({ data })
}

// ─── DELETE — delete document (admin only) ──────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  // Verify ownership + admin role
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', activeGroupId ?? '')
    .single()

  const isAdmin = membership?.role === 'super_admin' || membership?.role === 'group_admin'
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin.from('documents').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { deleted: true } })
}
