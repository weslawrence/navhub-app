/**
 * lib/sharepoint.ts — Microsoft Graph API helpers for SharePoint sync
 *
 * Environment variables required:
 *   SHAREPOINT_CLIENT_ID       — Azure AD app client ID
 *   SHAREPOINT_CLIENT_SECRET   — Azure AD app client secret
 *   SHAREPOINT_REDIRECT_URI    — e.g. https://app.navhub.co/api/integrations/sharepoint/callback
 *   NEXT_PUBLIC_APP_URL        — app base URL
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt, encrypt }  from '@/lib/encryption'

// ─── OAuth helpers ────────────────────────────────────────────────────────────

export const SHAREPOINT_SCOPES = [
  'https://graph.microsoft.com/Files.ReadWrite.All',
  'https://graph.microsoft.com/Sites.ReadWrite.All',
  'offline_access',
].join(' ')

export function getSharePointAuthUrl(state: string): string {
  const clientId = process.env.SHAREPOINT_CLIENT_ID ?? ''
  const redirectUri = process.env.SHAREPOINT_REDIRECT_URI ?? ''
  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    redirect_uri:  redirectUri,
    response_mode: 'query',
    scope:         SHAREPOINT_SCOPES,
    state,
  })
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
}

export async function exchangeSharePointCode(code: string): Promise<{
  access_token:  string
  refresh_token: string
  expires_in:    number
  scope:         string
}> {
  const clientId     = process.env.SHAREPOINT_CLIENT_ID     ?? ''
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET ?? ''
  const redirectUri  = process.env.SHAREPOINT_REDIRECT_URI  ?? ''

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      code,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SharePoint token exchange failed: ${text}`)
  }

  return res.json() as Promise<{
    access_token: string; refresh_token: string; expires_in: number; scope: string
  }>
}

// ─── Token management ─────────────────────────────────────────────────────────

export interface SharePointConnection {
  id:              string
  group_id:        string
  access_token:    string   // encrypted
  refresh_token:   string   // encrypted
  expires_at:      string   // ISO
  site_url:        string | null
  drive_id:        string | null
  folder_path:     string | null
  tenant_id:       string | null
  is_active:       boolean
}

export async function getValidSharePointToken(connectionId: string): Promise<{
  access_token: string
}> {
  const admin = createAdminClient()

  const { data: conn, error } = await admin
    .from('sharepoint_connections')
    .select('*')
    .eq('id', connectionId)
    .single()

  if (error || !conn) throw new Error('SharePoint connection not found')

  const decryptedAccess  = decrypt(conn.access_token)
  const decryptedRefresh = decrypt(conn.refresh_token)
  const expiresAt = new Date(conn.expires_at)
  const now = new Date()

  // Refresh if expires within 5 minutes
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    const clientId     = process.env.SHAREPOINT_CLIENT_ID     ?? ''
    const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET ?? ''

    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
        refresh_token: decryptedRefresh,
        scope:         SHAREPOINT_SCOPES,
      }).toString(),
    })

    if (!res.ok) throw new Error('SharePoint token refresh failed')

    const tokens = await res.json() as {
      access_token: string; refresh_token?: string; expires_in: number
    }

    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000)

    await admin.from('sharepoint_connections').update({
      access_token:  encrypt(tokens.access_token),
      refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : conn.refresh_token,
      expires_at:    newExpiry.toISOString(),
    }).eq('id', connectionId)

    return { access_token: tokens.access_token }
  }

  return { access_token: decryptedAccess }
}

// ─── Graph API helpers ────────────────────────────────────────────────────────

/**
 * Ensure a folder path exists on SharePoint drive, creating intermediary folders as needed.
 * Returns the folder item ID.
 */
export async function ensureSharePointFolder(
  accessToken: string,
  driveId:     string,
  folderPath:  string   // e.g. "NavHub/Documents"
): Promise<string> {
  const segments = folderPath.split('/').filter(Boolean)
  let parentId = 'root'

  for (const segment of segments) {
    // Check if folder exists
    const checkRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}/children?$filter=name eq '${encodeURIComponent(segment)}'&$select=id,name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (checkRes.ok) {
      const checkData = await checkRes.json() as { value: { id: string; name: string }[] }
      const existing = checkData.value.find(i => i.name === segment)
      if (existing) {
        parentId = existing.id
        continue
      }
    }

    // Create folder
    const createRes = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId}/children`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name:   segment,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        }),
      }
    )

    if (!createRes.ok) throw new Error(`Failed to create folder: ${segment}`)
    const folderItem = await createRes.json() as { id: string }
    parentId = folderItem.id
  }

  return parentId
}

/**
 * Upload a file to SharePoint. Overwrites if the file already exists (same name).
 * For files < 4 MB; large files would need chunked upload.
 */
export async function uploadFileToSharePoint(
  accessToken: string,
  driveId:     string,
  folderId:    string,
  filename:    string,
  content:     Buffer,
  mimeType:    string
): Promise<{ id: string; webUrl: string; name: string }> {
  const encodedName = encodeURIComponent(filename)
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}:/${encodedName}:/content`,
    {
      method:  'PUT',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
      body: new Uint8Array(content),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SharePoint upload failed: ${text}`)
  }

  return res.json() as Promise<{ id: string; webUrl: string; name: string }>
}

/**
 * Get basic info about the SharePoint drive (used during connect flow to validate access).
 */
export async function getSharePointDriveInfo(
  accessToken: string,
  driveId:     string
): Promise<{ id: string; name: string; webUrl: string }> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}?$select=id,name,webUrl`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error('Failed to fetch SharePoint drive info')
  return res.json() as Promise<{ id: string; name: string; webUrl: string }>
}

/**
 * List drives accessible by the current token (defaults to OneDrive for Business if no site set).
 */
export async function listSharePointDrives(
  accessToken: string,
  siteId?: string
): Promise<{ id: string; name: string; driveType: string; webUrl: string }[]> {
  const url = siteId
    ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`
    : 'https://graph.microsoft.com/v1.0/me/drives'

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return []
  const data = await res.json() as { value: { id: string; name: string; driveType: string; webUrl: string }[] }
  return data.value ?? []
}
