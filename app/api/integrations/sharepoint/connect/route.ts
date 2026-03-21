import { createClient }      from '@/lib/supabase/server'
import { cookies }            from 'next/headers'
import { redirect }           from 'next/navigation'
import { getSharePointAuthUrl } from '@/lib/sharepoint'

/**
 * GET /api/integrations/sharepoint/connect
 * Initiates the Microsoft OAuth2 flow for SharePoint.
 */
export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return new Response('No active group', { status: 400 })

  // Encode state: group_id so the callback knows where to store the connection
  const state = Buffer.from(JSON.stringify({ group_id: activeGroupId, user_id: session.user.id })).toString('base64url')

  const authUrl = getSharePointAuthUrl(state)
  redirect(authUrl)
}
