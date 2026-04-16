import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — returns all messages for this run
export async function GET(
  _request: Request,
  { params }: { params: { runId: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_run_messages')
    .select('id, run_id, role, content, created_at')
    .eq('run_id', params.runId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST — adds a user message (continuation trigger)
export async function POST(
  request: Request,
  { params }: { params: { runId: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await request.json() as { content?: string }
  if (!body.content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  const admin = createAdminClient()

  // Save user message
  const { data: msg, error } = await admin
    .from('agent_run_messages')
    .insert({ run_id: params.runId, role: 'user', content: body.content.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: msg }, { status: 201 })
}
