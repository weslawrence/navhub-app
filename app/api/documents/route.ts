import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DocumentType, DocumentAudience } from '@/lib/types'

// ─── GET — list documents ───────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase     = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore  = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const url    = new URL(request.url)
  const folder = url.searchParams.get('folder_id')
  const company = url.searchParams.get('company_id')
  const docType = url.searchParams.get('document_type')
  const status  = url.searchParams.get('status')

  // Check user role for status filtering
  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', activeGroupId)
    .single()

  const userRole = membership?.role ?? 'viewer'

  let query = supabase
    .from('documents')
    .select('*')
    .eq('group_id', activeGroupId)
    .order('updated_at', { ascending: false })

  if (folder === 'unfiled') query = query.is('folder_id', null)
  else if (folder)           query = query.eq('folder_id', folder)
  if (company)               query = query.eq('company_id', company)
  if (docType)               query = query.eq('document_type', docType)
  if (status)                query = query.eq('status', status)

  // Viewers can only see published documents
  if (userRole === 'viewer') {
    query = query.eq('status', 'published')
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch locked_by email for locked documents
  const lockedIds = (data ?? [])
    .filter((d: { locked_by: string | null }) => d.locked_by)
    .map((d: { locked_by: string }) => d.locked_by)

  const emailMap: Record<string, string> = {}
  if (lockedIds.length > 0) {
    const admin = createAdminClient()
    await Promise.all(lockedIds.map(async (uid: string) => {
      try {
        const { data: u } = await admin.auth.admin.getUserById(uid)
        if (u.user?.email) emailMap[uid] = u.user.email
      } catch { /* skip */ }
    }))
  }

  const enriched = (data ?? []).map((d: Record<string, unknown>) => ({
    ...d,
    locked_by_email: d.locked_by ? (emailMap[d.locked_by as string] ?? null) : null,
  }))

  return NextResponse.json({ data: enriched })
}

// ─── POST — create document ─────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { title, document_type, audience, folder_id, company_id, content_markdown } = body

  if (!title || !document_type || !audience) {
    return NextResponse.json({ error: 'title, document_type, and audience are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('documents').insert({
    group_id:         activeGroupId,
    company_id:       company_id ?? null,
    folder_id:        folder_id ?? null,
    title:            title as string,
    document_type:    document_type as DocumentType,
    audience:         audience as DocumentAudience,
    content_markdown: (content_markdown as string) ?? '',
    created_by:       session.user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget: auto-sync to SharePoint if a connection exists for this group.
  // Only attempts when content_markdown is non-empty (skip empty placeholders).
  if (data && (content_markdown as string)?.trim()) {
    void (async () => {
      try {
        const { data: conn } = await admin
          .from('sharepoint_connections')
          .select('id, drive_id')
          .eq('group_id', activeGroupId)
          .eq('is_active', true)
          .maybeSingle()
        if (!conn || !conn.drive_id) return

        // Lazy-import heavy dependencies so the main response is not delayed
        const { getValidSharePointToken, ensureSharePointFolder, uploadFileToSharePoint, getNavHubFolderPath } =
          await import('@/lib/sharepoint')
        const { exportToDocx } = await import('@/lib/document-export')

        const { data: group } = await admin
          .from('groups')
          .select('name')
          .eq('id', activeGroupId)
          .single()
        const groupName = group?.name ?? 'NavHub'

        // Resolve folder name for auto-mirror
        let folderName: string | null = null
        if (data.folder_id) {
          const { data: f } = await admin
            .from('document_folders')
            .select('name')
            .eq('id', data.folder_id)
            .maybeSingle()
          folderName = f?.name ?? null
        }

        // Look up explicit mapping first
        const { data: mapping } = await admin
          .from('folder_sharepoint_mappings')
          .select('sharepoint_path')
          .eq('group_id', activeGroupId)
          .or(`folder_id.eq.${data.folder_id ?? 'null'},folder_id.is.null`)
          .order('folder_id', { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()

        const { data: connFull } = await admin
          .from('sharepoint_connections')
          .select('folder_path')
          .eq('id', conn.id)
          .maybeSingle()

        const rootPath = (connFull?.folder_path as string | null) ?? 'NavHub'
        const targetPath = mapping?.sharepoint_path ?? getNavHubFolderPath(rootPath, folderName)

        const { access_token } = await getValidSharePointToken(conn.id)
        const docxBuffer = await exportToDocx(data, groupName)
        const folderId   = await ensureSharePointFolder(access_token, conn.drive_id, targetPath)
        const safeName   = (data.title as string ?? 'Document').replace(/[^a-zA-Z0-9 \-_]/g, '').trim() || 'Document'

        const uploaded = await uploadFileToSharePoint(
          access_token,
          conn.drive_id,
          folderId,
          `${safeName}.docx`,
          docxBuffer,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )

        void admin.from('document_sharepoint_sync').upsert({
          document_id:        data.id,
          connection_id:      conn.id,
          sharepoint_item_id: uploaded.id,
          sharepoint_url:     uploaded.webUrl,
          last_synced_at:     new Date().toISOString(),
          sync_status:        'synced',
        }, { onConflict: 'document_id' })
      } catch (err) {
        // Non-fatal — document creation succeeded; sync can be retried later.
        console.error('Auto-sync to SharePoint failed:', err)
      }
    })()
  }

  return NextResponse.json({ data }, { status: 201 })
}
