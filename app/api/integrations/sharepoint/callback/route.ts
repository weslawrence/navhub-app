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
    const { error: upsertError } = await admin
      .from('sharepoint_connections')
      .upsert({
        group_id:                groupId,
        tenant_id:               tenantId,
        access_token_encrypted:  encrypt(tokens.access_token),
        refresh_token_encrypted: encrypt(tokens.refresh_token),
        token_expires_at:        new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        is_active:               true,
        folder_path:             'NavHub/Documents',
      }, {
        onConflict: 'group_id',
        ignoreDuplicates: false,
      })

    if (upsertError) {
      console.error('SharePoint connection upsert error:', upsertError)
      return errorPage('db_error', `Database error: ${upsertError.message}`)
    }

    // Success — close popup quickly and notify parent
    return new Response(`
      <html><body style="font-family: system-ui; padding: 24px;">
        <h3 style="color: #16a34a;">Connected!</h3>
        <p>SharePoint is now linked to NavHub. You can close this window.</p>
        <script>
          window.opener?.postMessage({ type: 'sharepoint-connected' }, '*');
          setTimeout(() => window.close(), 800);
        </script>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  } catch (err) {
    console.error('SharePoint callback error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorPage('callback_error', msg)
  }
}
