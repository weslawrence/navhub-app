import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/encryption'

// POST — saves site + folder to sharepoint_connections after OAuth callback.
// Body: { connection_id: string, site_id: string, site_url: string, folder_path: string }
// Public route: called from the popup after OAuth completes (no session cookie
// guaranteed). The connection_id from callback ties the request to a specific
// connection row.
export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      connection_id?: string
      site_id?:       string
      site_url?:      string
      folder_path?:   string
      folder_id?:     string
    }

    if (!body.connection_id) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: conn, error: connErr } = await admin
      .from('sharepoint_connections')
      .select('id, access_token_encrypted')
      .eq('id', body.connection_id)
      .single()

    if (connErr || !conn) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Decrypt token + fetch drive for the selected site
    let driveId: string | null = null
    if (body.site_id) {
      try {
        const accessToken = decrypt(conn.access_token_encrypted)
        const driveRes = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${body.site_id}/drive`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } },
        )
        if (driveRes.ok) {
          const drive = await driveRes.json() as { id?: string }
          driveId = drive.id ?? null
        }
      } catch {
        // Non-fatal — continue without drive_id; user can re-setup later
      }
    }

    const updates: Record<string, unknown> = {}
    if (body.site_url)    updates.site_url    = body.site_url
    if (body.folder_path) updates.folder_path = body.folder_path
    if (driveId)          updates.drive_id    = driveId
    // body.folder_id is captured by the wizard for path resolution but not
    // persisted — the human-readable folder_path is the source of truth.

    if (Object.keys(updates).length > 0) {
      const { error } = await admin
        .from('sharepoint_connections')
        .update(updates)
        .eq('id', body.connection_id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, drive_id: driveId })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
