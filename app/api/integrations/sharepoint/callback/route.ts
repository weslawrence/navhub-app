import { createAdminClient }        from '@/lib/supabase/admin'
import { encrypt }                   from '@/lib/encryption'

/**
 * GET /api/integrations/sharepoint/callback
 * Handles the Microsoft OAuth2 callback, stores encrypted tokens.
 * Uses multi-tenant 'common' endpoint and extracts tenant_id from id_token.
 */
export async function GET(req: Request) {
  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const state  = url.searchParams.get('state')
  const error  = url.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.navhub.co'

  if (error) {
    return new Response(`
      <html><body>
      <script>
        window.opener?.postMessage({ type: 'sharepoint-error', error: ${JSON.stringify(error)} }, '*');
        window.close();
      </script>
      <p>Error: ${error}. You can close this window.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  if (!code || !state) {
    return new Response(`
      <html><body>
      <script>
        window.opener?.postMessage({ type: 'sharepoint-error', error: 'missing_code' }, '*');
        window.close();
      </script>
      <p>Missing code or state. You can close this window.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }

  // Parse state (JSON string from connect route)
  let groupId: string
  try {
    const parsed = JSON.parse(state) as { group_id: string }
    groupId = parsed.group_id
  } catch {
    return new Response(`
      <html><body>
      <script>
        window.opener?.postMessage({ type: 'sharepoint-error', error: 'invalid_state' }, '*');
        window.close();
      </script>
      <p>Invalid state. You can close this window.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
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
      return new Response(`
        <html><body>
        <script>
          window.opener?.postMessage({ type: 'sharepoint-error', error: 'token_exchange_failed' }, '*');
          window.close();
        </script>
        <p>Token exchange failed. You can close this window.</p>
        </body></html>
      `, { headers: { 'Content-Type': 'text/html' } })
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
    const { error: upsertError } = await admin
      .from('sharepoint_connections')
      .upsert({
        group_id:                groupId,
        tenant_id:               tenantId,
        access_token:            encrypt(tokens.access_token),
        refresh_token:           encrypt(tokens.refresh_token),
        expires_at:              new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        is_active:               true,
        folder_path:             'NavHub/Documents',
      }, {
        onConflict: 'group_id',
        ignoreDuplicates: false,
      })

    if (upsertError) {
      console.error('SharePoint connection upsert error:', upsertError)
      return new Response(`
        <html><body>
        <script>
          window.opener?.postMessage({ type: 'sharepoint-error', error: 'db_error' }, '*');
          window.close();
        </script>
        <p>Database error. You can close this window.</p>
        </body></html>
      `, { headers: { 'Content-Type': 'text/html' } })
    }

    // Close popup and notify parent window
    return new Response(`
      <html><body>
      <script>
        window.opener?.postMessage({ type: 'sharepoint-connected' }, '*');
        window.close();
      </script>
      <p>Connected! You can close this window.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  } catch (err) {
    console.error('SharePoint callback error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return new Response(`
      <html><body>
      <script>
        window.opener?.postMessage({ type: 'sharepoint-error', error: ${JSON.stringify(msg)} }, '*');
        window.close();
      </script>
      <p>Error: ${msg}. You can close this window.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  }
}

