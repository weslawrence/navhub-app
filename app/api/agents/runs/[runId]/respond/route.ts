import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── POST /api/agents/runs/[runId]/respond ────────────────────────────────────
// Saves the user's answer to an agent_run_interactions row.
// The agent-runner polls this table while waiting in handleAskUser().

export async function POST(
  request: Request,
  { params }: { params: { runId: string } }
) {
  try {
    const supabase      = createClient()
    const cookieStore   = cookies()
    const activeGroupId = cookieStore.get('active_group_id')?.value

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const body = await request.json() as { interaction_id?: string; answer: string }
    const { interaction_id, answer } = body

    if (typeof answer !== 'string' || !answer.trim()) {
      return NextResponse.json({ error: 'answer is required' }, { status: 400 })
    }

    // Verify the run belongs to the active group (RLS check via server client)
    const { data: run } = await supabase
      .from('agent_runs')
      .select('id, status, group_id')
      .eq('id', params.runId)
      .single()

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    // Extra guard: ensure the run belongs to the active group
    if (activeGroupId && run.group_id !== activeGroupId) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    if (run.status !== 'awaiting_input') {
      return NextResponse.json({ error: 'Run is not awaiting input' }, { status: 409 })
    }

    const admin = createAdminClient()

    // Resolve interaction: use provided interaction_id or find latest unanswered for this run
    let resolvedInteractionId: string
    if (interaction_id) {
      const { data: interaction } = await admin
        .from('agent_run_interactions')
        .select('id, answered_at')
        .eq('id', interaction_id)
        .eq('run_id', params.runId)
        .single()

      if (!interaction) {
        return NextResponse.json({ error: 'Interaction not found' }, { status: 404 })
      }
      if (interaction.answered_at) {
        return NextResponse.json({ error: 'Interaction already answered' }, { status: 409 })
      }
      resolvedInteractionId = interaction_id
    } else {
      // Find the latest unanswered interaction for this run
      const { data: latest } = await admin
        .from('agent_run_interactions')
        .select('id, answered_at')
        .eq('run_id', params.runId)
        .is('answered_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!latest) {
        return NextResponse.json({ error: 'No pending interaction found for this run' }, { status: 404 })
      }
      resolvedInteractionId = (latest as { id: string }).id
    }

    // Record the answer
    const { error } = await admin
      .from('agent_run_interactions')
      .update({
        answer:      answer.trim(),
        answered_at: new Date().toISOString(),
      })
      .eq('id', resolvedInteractionId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('Respond API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
