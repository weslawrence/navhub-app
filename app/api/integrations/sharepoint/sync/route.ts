import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'
import {
  getValidSharePointToken,
  ensureSharePointFolder,
  uploadFileToSharePoint,
  getNavHubFolderPath,
} from '@/lib/sharepoint'
import { exportToDocx } from '@/lib/document-export'
import type { Document } from '@/lib/types'

/**
 * POST /api/integrations/sharepoint/sync
 * Exports a document to DOCX and uploads it to SharePoint.
 *
 * Body: { document_id: string }
 */
export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const body = await req.json() as { document_id?: string }
  if (!body.document_id) return NextResponse.json({ error: 'document_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Fetch SharePoint connection
  const { data: conn } = await admin
    .from('sharepoint_connections')
    .select('*')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)
    .maybeSingle()

  if (!conn) return NextResponse.json({ error: 'No active SharePoint connection' }, { status: 422 })

  // Fetch document (verify group ownership via RLS)
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', body.document_id)
    .eq('is_active', true)
    .single()

  if (docError || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Fetch group name for DOCX header
  const { data: group } = await admin
    .from('groups')
    .select('name')
    .eq('id', activeGroupId)
    .single()

  const groupName = group?.name ?? 'NavHub'

  // Resolve target SharePoint path:
  //   1. Explicit folder_sharepoint_mappings row for this folder (if any)
  //   2. Auto-mirror: <connection.folder_path>/<navhub folder name or "Unfiled">
  //   3. Group-level default mapping (folder_id IS NULL)
  const { data: mapping } = await admin
    .from('folder_sharepoint_mappings')
    .select('sharepoint_path')
    .eq('group_id', activeGroupId)
    .or(`folder_id.eq.${doc.folder_id ?? 'null'},folder_id.is.null`)
    .order('folder_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  let targetPath: string
  if (mapping?.sharepoint_path) {
    targetPath = mapping.sharepoint_path
  } else {
    // Auto-mirror NavHub folder structure under the connection root
    const rootPath = (conn.folder_path as string | null) ?? 'NavHub'
    let navhubFolderName: string | null = null
    if (doc.folder_id) {
      const { data: folder } = await admin
        .from('document_folders')
        .select('name')
        .eq('id', doc.folder_id)
        .maybeSingle()
      navhubFolderName = folder?.name ?? null
    }
    targetPath = getNavHubFolderPath(rootPath, navhubFolderName)
  }

  try {
    // Get valid access token (refreshes if needed)
    const { access_token } = await getValidSharePointToken(conn.id)

    // Export document to DOCX buffer
    const docxBuffer = await exportToDocx(doc as Document, groupName)

    // Ensure folder exists using the folder-specific path
    const driveId    = conn.drive_id
    const folderPath = targetPath

    if (!driveId) {
      return NextResponse.json({ error: 'SharePoint drive not configured. Update connection settings.' }, { status: 422 })
    }

    const folderId = await ensureSharePointFolder(access_token, driveId, folderPath)

    // Build safe filename
    const safeName = doc.title.replace(/[^a-zA-Z0-9 \-_]/g, '').trim() || 'Document'
    const filename  = `${safeName}.docx`

    // Upload
    const uploaded = await uploadFileToSharePoint(
      access_token,
      driveId,
      folderId,
      filename,
      docxBuffer,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

    // Record sync in document_sharepoint_sync table
    void admin.from('document_sharepoint_sync').upsert({
      document_id:        doc.id,
      connection_id:      conn.id,
      sharepoint_item_id: uploaded.id,
      sharepoint_url:     uploaded.webUrl,
      last_synced_at:     new Date().toISOString(),
      sync_status:        'synced',
    }, { onConflict: 'document_id' })

    return NextResponse.json({
      success:  true,
      filename: uploaded.name,
      url:      uploaded.webUrl,
    })
  } catch (err) {
    console.error('SharePoint sync error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'

    // Record failure
    void admin.from('document_sharepoint_sync').upsert({
      document_id:    body.document_id,
      connection_id:  conn.id,
      last_synced_at: new Date().toISOString(),
      sync_status:    'error',
      error_message:  msg,
    }, { onConflict: 'document_id' })

    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
