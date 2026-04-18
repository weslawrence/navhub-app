import { createAdminClient }        from '@/lib/supabase/admin'
import { encrypt }                   from '@/lib/encryption'

/**
 * GET /api/integrations/sharepoint/callback
 * Handles the Microsoft OAuth2 callback, stores encrypted tokens.
 * Uses multi-tenant 'common' endpoint and extracts tenant_id from id_token.
 */

function errorPage(code: string, message: string) {
  const safeMsg  = message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeCode = JSON.stringify(code)
  return new Response(`
    <html><body style="font-family: system-ui; padding: 24px; max-width: 480px;">
      <h3 style="color: #b91c1c;">Connection failed</h3>
      <p>${safeMsg}</p>
      <p style="color: #71717a; font-size: 13px;">This window will close automatically in a few seconds.</p>
      <script>
        window.opener?.postMessage({ type: 'sharepoint-error', error: ${safeCode} }, '*');
        setTimeout(() => window.close(), 3000);
      </script>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html' } })
}

export async function GET(req: Request) {
  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const state  = url.searchParams.get('state')
  const error  = url.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.navhub.co'

  if (error) {
    return errorPage(error, `Microsoft returned: ${error}`)
  }

  if (!code || !state) {
    return errorPage('missing_code', 'Missing authorisation code or state from Microsoft.')
  }

  // Parse state (JSON string from connect route)
  let groupId: string
  try {
    const parsed = JSON.parse(state) as { group_id: string }
    groupId = parsed.group_id
  } catch {
    return errorPage('invalid_state', 'Invalid OAuth state parameter.')
  }

  try {
    // Exchange code for tokens using common endpoint
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.SHAREPOINT_CLIENT_ID!,
        client_secret: process.env.SHAREPOINT_CLIENT_SECRET!,
        code,
        redirect_uri:  `${appUrl}/api/integrations/sharepoint/callback`,
        grant_type:    'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error('SharePoint token exchange failed:', text)
      return errorPage('token_exchange_failed', `Token exchange failed: ${text.slice(0, 200)}`)
    }

    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
      id_token: string
    }

    // Extract tenant ID from the ID token JWT (middle section)
    let tenantId: string
    try {
      const idTokenPayload = JSON.parse(
        Buffer.from(tokens.id_token.split('.')[1], 'base64').toString()
      ) as { tid: string }
      tenantId = idTokenPayload.tid
    } catch {
      // If id_token parsing fails, use 'common' as fallback
      tenantId = 'common'
    }

    const admin = createAdminClient()

    // Store connection with the user's actual tenant ID
    // Check for existing connection for this group (there is no unique
    // constraint on group_id alone in the current schema, so use explicit
    // insert/update rather than upsert with onConflict).
    const { data: existing } = await admin
      .from('sharepoint_connections')
      .select('id')
      .eq('group_id', groupId)
      .maybeSingle()

    const tokenPayload = {
      tenant_id:               tenantId,
      access_token_encrypted:  encrypt(tokens.access_token),
      refresh_token_encrypted: encrypt(tokens.refresh_token),
      token_expires_at:        new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      is_active:               true,
    }

    let dbError: { message: string } | null = null
    let connectionId: string | null = null
    if (existing) {
      const { error } = await admin
        .from('sharepoint_connections')
        .update(tokenPayload)
        .eq('id', existing.id)
      dbError = error ? { message: error.message } : null
      connectionId = existing.id as string
    } else {
      const { data: inserted, error } = await admin
        .from('sharepoint_connections')
        .insert({
          group_id:    groupId,
          folder_path: 'NavHub/Documents',
          ...tokenPayload,
        })
        .select('id')
        .single()
      dbError = error ? { message: error.message } : null
      connectionId = inserted?.id ?? null
    }

    if (dbError) {
      console.error('SharePoint connection save error:', dbError)
      return errorPage('db_error', `Database error: ${dbError.message}`)
    }

    // Fetch available sites for the setup wizard
    let sites: Array<{ id: string; name: string; webUrl: string }> = []
    try {
      const sitesRes = await fetch('https://graph.microsoft.com/v1.0/sites?search=*', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      })
      if (sitesRes.ok) {
        const sitesJson = await sitesRes.json() as { value?: Array<{ id: string; displayName: string; webUrl: string }> }
        sites = (sitesJson.value ?? []).map(s => ({
          id:     s.id,
          name:   s.displayName,
          webUrl: s.webUrl,
        }))
      }
    } catch {
      // Non-fatal — show wizard without site list; user can set folder + skip
    }

    // Escape helper for inline values
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const safeConnId = esc(connectionId ?? '')
    const sitesOptions = sites.length > 0
      ? sites.map(s => `<option value="${esc(s.id)}" data-url="${esc(s.webUrl)}">${esc(s.name)} — ${esc(s.webUrl)}</option>`).join('')
      : '<option value="">No sites available — you can skip and set the folder path only</option>'

    return new Response(`
      <html>
      <head><title>SharePoint Setup</title></head>
      <body style="font-family: system-ui; padding: 32px 24px; max-width: 480px; margin: 0 auto; color: #0f172a;">
        <h2 style="margin-bottom: 8px; font-size: 20px;">✓ SharePoint Connected</h2>
        <p style="color: #64748b; margin-bottom: 24px; font-size: 14px;">
          Choose your SharePoint site and default folder for document sync.
        </p>

        <label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px;">SharePoint Site</label>
        <select id="siteSelect" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 16px; font-size: 13px; background: white;">
          ${sitesOptions}
        </select>

        <label style="display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px;">Default Folder Path</label>
        <input
          id="folderPath"
          type="text"
          value="NavHub/Documents"
          placeholder="NavHub/Documents"
          style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; background: white; box-sizing: border-box;"
        />
        <p style="font-size: 11px; color: #94a3b8; margin-top: 4px; margin-bottom: 24px;">
          Documents will sync to this folder in your SharePoint site.
        </p>

        <div style="display: flex; gap: 8px;">
          <button
            onclick="saveAndClose()"
            style="flex: 1; padding: 10px; background: #0f172a; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500;"
          >Save &amp; Continue</button>
          <button
            onclick="skipAndClose()"
            style="padding: 10px 16px; background: white; color: #475569; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; cursor: pointer;"
          >Skip</button>
        </div>

        <script>
          const connectionId = ${JSON.stringify(safeConnId)};
          async function saveAndClose() {
            const siteSelect = document.getElementById('siteSelect');
            const siteId  = siteSelect.value || null;
            const opt     = siteSelect.options[siteSelect.selectedIndex];
            const siteUrl = opt && opt.dataset ? opt.dataset.url : null;
            const folderPath = document.getElementById('folderPath').value || 'NavHub/Documents';
            try {
              await fetch('/api/integrations/sharepoint/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connection_id: connectionId, site_id: siteId, site_url: siteUrl, folder_path: folderPath })
              });
            } catch (e) { /* ignore and close anyway */ }
            window.opener?.postMessage({ type: 'sharepoint-connected' }, '*');
            window.close();
          }
          function skipAndClose() {
            window.opener?.postMessage({ type: 'sharepoint-connected' }, '*');
            window.close();
          }
        </script>
      </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html' } })
  } catch (err) {
    console.error('SharePoint callback error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorPage('callback_error', msg)
  }
}
