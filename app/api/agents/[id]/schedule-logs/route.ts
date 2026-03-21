import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  // Verify the agent belongs to the active group (RLS)
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('scheduled_run_logs')
    .select('*')
    .eq('agent_id', params.id)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('schedule-logs GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
