import { createAdminClient } from '@/lib/supabase/admin'
import { calculateNextRun } from '@/lib/scheduling'
import type { ScheduleConfig } from '@/lib/scheduling'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()

  const { data: dueAgents, error } = await admin
    .from('agents')
    .select('*')
    .eq('schedule_enabled', true)
    .eq('is_active', true)
    .lte('next_scheduled_run_at', now.toISOString())
    .not('schedule_config', 'is', null)

  if (error) {
    console.error('Failed to fetch due agents:', error)
    return Response.json({ error: 'Failed to fetch due agents' }, { status: 500 })
  }

  const results: { agent_id: string; status: string; run_id?: string }[] = []

  for (const agent of dueAgents ?? []) {
    try {
      // Create agent run record
      const { data: run, error: runError } = await admin
        .from('agent_runs')
        .insert({
          agent_id:     agent.id,
          group_id:     agent.group_id,
          status:       'queued',
          triggered_by: 'schedule',
          input_context: {
            extra_instructions: agent.instructions ?? 'Run your scheduled task.',
            triggered_by: 'schedule',
          },
        })
        .select('id')
        .single()

      if (runError || !run) throw runError ?? new Error('No run created')

      // Log scheduled run
      await admin.from('scheduled_run_logs').insert({
        agent_id:     agent.id,
        run_id:       run.id,
        scheduled_at: agent.next_scheduled_run_at ?? now.toISOString(),
        triggered_at: now.toISOString(),
        status:       'triggered',
      })

      // Calculate and update next run time, using the group's timezone
      const { data: group } = await admin
        .from('groups')
        .select('timezone')
        .eq('id', agent.group_id)
        .single()
      const groupTimezone = group?.timezone ?? 'Australia/Brisbane'
      const config = agent.schedule_config as ScheduleConfig
      const nextRun = calculateNextRun(config, now, groupTimezone)
      await admin
        .from('agents')
        .update({
          next_scheduled_run_at: nextRun.toISOString(),
          last_scheduled_run_at: now.toISOString(),
        })
        .eq('id', agent.id)

      // Fire-and-forget: trigger the stream endpoint to execute the run
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.navhub.co'
      void fetch(`${appUrl}/api/agents/runs/${run.id}/stream?scheduled=1`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      }).catch(err => console.error(`Failed to trigger agent ${agent.id}:`, err))

      results.push({ agent_id: agent.id, status: 'triggered', run_id: run.id })
    } catch (err) {
      console.error(`Error scheduling agent ${agent.id}:`, err)
      await admin.from('scheduled_run_logs').insert({
        agent_id:     agent.id,
        scheduled_at: agent.next_scheduled_run_at ?? now.toISOString(),
        triggered_at: now.toISOString(),
        status:       'failed',
        error:        err instanceof Error ? err.message : 'Unknown error',
      })
      results.push({ agent_id: agent.id, status: 'failed' })
    }
  }

  return Response.json({ processed: results.length, results, timestamp: now.toISOString() })
}
