import { NextResponse }  from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'

export const runtime = 'nodejs'

// ── GET /api/agents/runs/[runId]/info ─────────────────────────────────────────
// Returns run metadata + agent info without streaming

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } }
) {
  const supabase   = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const { data: run } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('id', params.runId)
    .eq('group_id', activeGroupId)
    .single()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, avatar_color, model')
    .eq('id', run.agent_id)
    .eq('group_id', activeGroupId)
    .single()

  return NextResponse.json({ data: { run, agent } })
}
