import { NextResponse }     from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// ── POST /api/agents/runs/[runId]/cancel ──────────────────────────────────────
// Sets cancellation_requested = true on a running agent_run.
// The SSE stream handler detects this flag at its next checkpoint and stops.

export async function POST(
  _request: Request,
  { params }: { params: { runId: string } }
) {
  const supabase    = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  // Verify run exists and belongs to the user's active group (RLS)
  const { data: run } = await supabase
    .from('agent_runs')
    .select('id, status')
    .eq('id', params.runId)
    .eq('group_id', activeGroupId)
    .single()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  if (run.status !== 'running' && run.status !== 'queued') {
    return NextResponse.json(
      { error: `Cannot cancel a run with status '${run.status as string}'` },
      { status: 422 }
    )
  }

  // Set the cancellation flag + flip status to 'cancelling' so the UI gets
  // immediate feedback while the runner unwinds (it'll detect the flag at
  // its next stream checkpoint and finalise to 'cancelled').
  const admin = createAdminClient()
  const { error } = await admin
    .from('agent_runs')
    .update({ cancellation_requested: true, status: 'cancelling' })
    .eq('id', params.runId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { cancelled: true } })
}
