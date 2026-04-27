import { NextResponse }     from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt }           from '@/lib/encryption'

/**
 * GET /api/integrations/slack/channels
 * Lists public channels in the connected Slack workspace for the active group.
 * Returns: { channels: { id: string; name: string; is_member?: boolean }[] }
 *
 * Bot needs the channels:read scope. Filter to public channels, exclude
 * archived. Sorted alphabetically; first 100 returned.
 */
export const runtime = 'nodejs'

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()
  const { data: conn } = await admin
    .from('slack_connections')
    .select('bot_token_encrypted')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)
    .maybeSingle()

  if (!conn) return NextResponse.json({ channels: [] })

  let token: string
  try { token = decrypt(conn.bot_token_encrypted as string) }
  catch { return NextResponse.json({ channels: [], error: 'Stored token could not be decrypted' }) }

  try {
    const url = new URL('https://slack.com/api/conversations.list')
    url.searchParams.set('types', 'public_channel')
    url.searchParams.set('exclude_archived', 'true')
    url.searchParams.set('limit', '200')

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json() as {
      ok:        boolean
      error?:    string
      channels?: Array<{ id: string; name: string; is_member?: boolean }>
    }

    if (!json.ok) {
      return NextResponse.json({ channels: [], error: json.error ?? 'slack_api_error' }, { status: 502 })
    }

    const channels = (json.channels ?? [])
      .map(c => ({ id: c.id, name: c.name, is_member: !!c.is_member }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 100)

    return NextResponse.json({ channels })
  } catch (err) {
    return NextResponse.json({
      channels: [],
      error:    err instanceof Error ? err.message : 'unknown',
    }, { status: 500 })
  }
}
