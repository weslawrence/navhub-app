import { createClient }      from '@/lib/supabase/server'
import { cookies }            from 'next/headers'

/**
 * GET /api/integrations/sharepoint/connect
 * Initiates the Microsoft OAuth2 flow for SharePoint using multi-tenant 'common' endpoint.
 */
export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return new Response('No active group', { status: 400 })

  const clientId = process.env.SHAREPOINT_CLIENT_ID
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return new Response(`
      <html><body>
      <h2>SharePoint not configured</h2>
      <p>SHAREPOINT_CLIENT_ID and SHAREPOINT_CLIENT_SECRET must be set.</p>
      <p>Register a multi-tenant Azure AD app at portal.azure.com</p>
      <script>setTimeout(() => window.close(), 5000)</script>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' }, status: 500 })
  }

  // Use 'common' endpoint for multi-tenant support
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
    new URLSearchParams({
      client_id:     clientId,
      response_type: 'code',
      redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/sharepoint/callback`,
      response_mode: 'query',
      scope:         'https://graph.microsoft.com/Files.ReadWrite.All https://graph.microsoft.com/Sites.ReadWrite.All offline_access',
      state:         JSON.stringify({ group_id: activeGroupId, user_id: session.user.id }),
    })

  return Response.redirect(authUrl)
}
