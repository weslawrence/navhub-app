import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

/**
 * GET /api/documents/[id]/sharepoint-sync
 * Returns the SharePoint sync status for a specific document.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  // Verify document belongs to group (RLS — there is no is_active column on documents)
  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data: syncRecord } = await admin
    .from('document_sharepoint_sync')
    .select('sharepoint_item_id, sharepoint_url, last_synced_at, sync_status, error_message')
    .eq('document_id', params.id)
    .maybeSingle()

  return NextResponse.json({ data: syncRecord ?? null })
}

/**
 * POST /api/documents/[id]/sharepoint-sync
 * Triggers a manual sync of the document to SharePoint.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()

  // Verify document
  const { data: doc } = await admin
    .from('documents')
    .select('id, title, folder_id, content_markdown, file_path, file_name, file_type')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Get SharePoint connection
  const { data: conn } = await admin
    .from('sharepoint_connections')
    .select('*')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)
    .maybeSingle()

  if (!conn || !conn.drive_id) {
    return NextResponse.json({ error: 'SharePoint not connected' }, { status: 400 })
  }

  try {
    const { getValidSharePointToken, ensureSharePointFolder, uploadFileToSharePoint, getNavHubFolderPath } = await import('@/lib/sharepoint')

    // Look up folder mapping
    const { data: mapping } = await admin
      .from('folder_sharepoint_mappings')
      .select('sharepoint_path')
      .eq('group_id', activeGroupId)
      .or(doc.folder_id ? `folder_id.eq.${doc.folder_id},folder_id.is.null` : 'folder_id.is.null')
      .order('folder_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    const { access_token } = await getValidSharePointToken(conn.id)
    const { data: groupData } = await admin.from('groups').select('name').eq('id', activeGroupId).single()
    const groupName = groupData?.name ?? 'NavHub'

    let fileBuffer: Buffer
    let fileName: string
    let mimeType: string

    if (doc.file_path) {
      const { data: fileData } = await admin.storage.from('documents').download(doc.file_path)
      fileBuffer = Buffer.from(await fileData!.arrayBuffer())
      fileName = doc.file_name ?? 'document'
      mimeType = doc.file_type ?? 'application/octet-stream'
    } else {
      const { exportToDocx } = await import('@/lib/document-export')
      fileBuffer = await exportToDocx(doc as Parameters<typeof exportToDocx>[0], groupName)
      const safeName = doc.title.replace(/[^a-zA-Z0-9 \-_]/g, '').trim() || 'Document'
      fileName = `${safeName}.docx`
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }

    const rootPath   = (conn.folder_path as string | null) ?? 'NavHub'
    const folderName = doc.folder_id
      ? ((await admin.from('document_folders').select('name').eq('id', doc.folder_id).single()).data?.name ?? 'Unfiled')
      : 'Unfiled'
    const folderPath = mapping?.sharepoint_path ?? getNavHubFolderPath(rootPath, folderName)
    const folderId = await ensureSharePointFolder(access_token, conn.drive_id, folderPath)

    const uploaded = await uploadFileToSharePoint(
      access_token, conn.drive_id, folderId, fileName, fileBuffer, mimeType,
    )

    await admin.from('document_sharepoint_sync').upsert({
      document_id: params.id,
      connection_id: conn.id,
      sharepoint_item_id: uploaded.id,
      sharepoint_url: uploaded.webUrl,
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      error_message: null,
    }, { onConflict: 'document_id' })

    return NextResponse.json({ success: true, filename: fileName })
  } catch (err) {
    console.error('SharePoint sync error:', err)

    await admin.from('document_sharepoint_sync').upsert({
      document_id: params.id,
      sync_status: 'failed',
      error_message: err instanceof Error ? err.message : 'Unknown error',
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'document_id' }).select()

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 },
    )
  }
}
