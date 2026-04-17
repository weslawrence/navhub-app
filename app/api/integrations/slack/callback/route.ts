import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt }            from '@/lib/encryption'

function errorPage(code: string, message: string) {
  const safeMsg  = message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const safeCode = JSON.stringify(code)
  return new Response(`
    <html><body style="font-family: system-ui; padding: 24px; max-width: 480px;">
      <h3 style="color: #b91c1c;">Slack connection failed</h3>
      <p>${safeMsg}</p>
      <p style="color: #71717a; font-size: 13px;">This window will close in a few seconds.</p>
      <script>
        window.opener?.postMessage({ type: 'slack-error', error: ${safeCode} }, '*');
        setTimeout(() => window.close(), 3000);
      </script>
    </body></html>
  `, { headers: { 'Content-Type': 'text/html' } })
}

export async function GET(req: Request) {
  const url   = new URL(req.url)
  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) return errorPage(error, `Slack returned: ${error}`)
  if (!code || !state) return errorPage('missing_code', 'Missing authorisation code or state.')

  let groupId: string
  try {
    const parsed = JSON.parse(state) as { group_id: string }
    groupId = parsed.group_id
  } catch {
    return errorPage('invalid_state', 'Invalid OAuth state parameter.')
  }

  try {
    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/slack/callback`,
      }),
    })

    const tokens = await tokenRes.json() as {
      ok:           boolean
      access_token: string
      team:         { id: string; name: string }
      incoming_webhook?: { url: string }
      error?:       string
    }

    if (!tokens.ok) {
      return errorPage('token_exchange_failed', tokens.error ?? 'Slack token exchange failed.')
    }

    const admin = createAdminClient()
    const { error: upsertErr } = await admin
      .from('slack_connections')
      .upsert({
        group_id:              groupId,
        team_id:               tokens.team.id,
        team_name:             tokens.team.name,
        bot_token_encrypted:   encrypt(tokens.access_token),
        webhook_url_encrypted: tokens.incoming_webhook?.url ? encrypt(tokens.incoming_webhook.url) : null,
        is_active:             true,
      }, { onConflict: 'group_id,team_id' })

    if (upsertErr) return errorPage('db_error', `Database error: ${upsertErr.message}`)

    return new Response(`
      <html><body style="font-family: system-ui; padding: 24px;">
        <h3 style="color: #16a34a;">Slack connected!</h3>
        <p>${tokens.team.name} is now linked to NavHub. You can close this window.</p>
        <script>
          window.opener?.postMessage({ type: 'slack-connected', team: ${JSON.stringify(tokens.team.name)} }, '*');
          setTimeout(() => window.close(), 800);
        </script>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return errorPage('callback_error', msg)
  }
}
