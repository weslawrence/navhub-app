import { NextResponse }  from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'

export const runtime = 'nodejs'

// ── GET /api/agents/[id]/runs ─────────────────────────────────────────────────
// List run history for an agent (ordered newest first)

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase   = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  // Verify agent exists and user can access it (RLS)
  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const url    = new URL(request.url)
  const limit  = Math.min(100, parseInt(url.searchParams.get('limit')  ?? '20', 10))
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

  const { data: runs, error, count } = await supabase
    .from('agent_runs')
    .select('*', { count: 'exact' })
    .eq('agent_id', params.id)
    .eq('group_id', activeGroupId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: runs ?? [], total: count ?? 0 })
}
