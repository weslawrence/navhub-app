import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/encryption'

/**
 * GET /api/integrations/sharepoint/folders
 *
 * Lists folders in a SharePoint drive for the folder-picker wizard.
 *
 * Query params:
 *   connection_id  required — sharepoint_connections.id (used to scope the request)
 *   parent_id      optional — folder item ID to list children of; defaults to drive root
 *   site_id        optional — overrides drive resolution (uses connection.drive_id otherwise)
 *
 * Returns: { folders: { id, name, webUrl, childCount }[], parent_id, drive_id }
 *
 * Public route (called from the OAuth popup which may not have a session cookie).
 * Authorisation is via connection_id.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const connectionId = url.searchParams.get('connection_id')
  const parentId     = url.searchParams.get('parent_id') ?? null
  const siteIdParam  = url.searchParams.get('site_id')

  if (!connectionId) {
    return NextResponse.json({ error: 'connection_id required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: conn, error } = await admin
    .from('sharepoint_connections')
    .select('id, drive_id, access_token_encrypted')
    .eq('id', connectionId)
    .maybeSingle()

  if (error || !conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  const accessToken = decrypt(conn.access_token_encrypted)

  // Resolve drive_id: prefer the connection's stored drive_id; if a site_id
  // override is supplied, fetch the default drive for that site instead.
  let driveId: string | null = conn.drive_id ?? null
  if (siteIdParam) {
    try {
      const driveRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${siteIdParam}/drive`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (driveRes.ok) {
        const drive = await driveRes.json() as { id?: string }
        if (drive.id) driveId = drive.id
      }
    } catch {
      // fall through — driveId may still be the connection's stored value
    }
  }

  if (!driveId) {
    // No drive configured yet — fall back to the user's default drive (OneDrive).
    try {
      const meRes = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (meRes.ok) {
        const me = await meRes.json() as { id?: string }
        if (me.id) driveId = me.id
      }
    } catch { /* ignore */ }
  }

  if (!driveId) {
    return NextResponse.json({ error: 'No drive configured for this connection' }, { status: 422 })
  }

  // List folder children
  const childrenUrl = parentId
    ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}/children?$select=id,name,webUrl,folder,parentReference`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children?$select=id,name,webUrl,folder,parentReference`

  const res = await fetch(childrenUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `Graph API error: ${text.slice(0, 200)}` }, { status: 500 })
  }

  const json = await res.json() as {
    value?: Array<{
      id:       string
      name:     string
      webUrl:   string
      folder?:  { childCount?: number }
    }>
  }

  // Filter to folders only
  const folders = (json.value ?? [])
    .filter(item => !!item.folder)
    .map(item => ({
      id:         item.id,
      name:       item.name,
      webUrl:     item.webUrl,
      childCount: item.folder?.childCount ?? 0,
    }))

  return NextResponse.json({
    folders,
    parent_id: parentId,
    drive_id:  driveId,
  })
}
