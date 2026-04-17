import { createClient } from '@/lib/supabase/server'
import { cookies }       from 'next/headers'

/**
 * GET /api/integrations/slack/connect
 * Initiates Slack OAuth v2 flow. Redirects to slack.com/oauth/v2/authorize.
 */
export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return new Response('Unauthorised', { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return new Response('No active group', { status: 400 })

  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) {
    return new Response(`
      <html><body style="font-family: system-ui; padding: 24px; max-width: 480px;">
        <h3 style="color: #b91c1c;">Slack not configured</h3>
        <p>SLACK_CLIENT_ID is not set. Create a Slack app at api.slack.com/apps
           and add credentials to Vercel env vars.</p>
        <script>setTimeout(() => window.close(), 5000)</script>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' }, status: 500 })
  }

  const state = JSON.stringify({ group_id: activeGroupId, user_id: session.user.id })
  const params = new URLSearchParams({
    client_id:    clientId,
    scope:        'chat:write,channels:read,incoming-webhook',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/slack/callback`,
    state,
  })

  return Response.redirect(`https://slack.com/oauth/v2/authorize?${params}`, 302)
}
