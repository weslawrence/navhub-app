import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidSharePointToken } from '@/lib/sharepoint'

// GET — lists available SharePoint sites for the active group's connection.
// Returns { sites: [{ id, name, webUrl }] }
export async function GET() {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const cookieStore   = cookies()
    const activeGroupId = cookieStore.get('active_group_id')?.value
    if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

    const admin = createAdminClient()
    const { data: conn } = await admin
      .from('sharepoint_connections')
      .select('id')
      .eq('group_id', activeGroupId)
      .eq('is_active', true)
      .maybeSingle()

    if (!conn) return NextResponse.json({ sites: [] })

    const { access_token } = await getValidSharePointToken(conn.id)

    const res  = await fetch('https://graph.microsoft.com/v1.0/sites?search=*', {
      headers: { 'Authorization': `Bearer ${access_token}` },
    })
    const json = await res.json() as { value?: Array<{ id: string; displayName: string; webUrl: string }> }
    const sites = (json.value ?? []).map(s => ({
      id:     s.id,
      name:   s.displayName,
      webUrl: s.webUrl,
    }))

    return NextResponse.json({ sites })
  } catch (err) {
    return NextResponse.json({ error: String(err), sites: [] }, { status: 500 })
  }
}
