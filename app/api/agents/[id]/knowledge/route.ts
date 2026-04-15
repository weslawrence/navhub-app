import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET — full knowledge config for an agent ──────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()

  const { data: agent } = await admin
    .from('agents')
    .select('knowledge_text, knowledge_links')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()

  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const { data: documents } = await admin
    .from('agent_knowledge_documents')
    .select('id, agent_id, document_id, file_path, file_name, file_type, file_size, created_at')
    .eq('agent_id', params.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    data: {
      knowledge_text: agent.knowledge_text ?? '',
      knowledge_links: agent.knowledge_links ?? [],
      documents: documents ?? [],
    },
  })
}

// ─── PATCH — update knowledge_text and/or knowledge_links ──────────────────

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const body = await request.json() as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if ('knowledge_text' in body) updates.knowledge_text = body.knowledge_text ?? null
  if ('knowledge_links' in body) updates.knowledge_links = body.knowledge_links ?? []

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agents')
    .update(updates)
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .select('knowledge_text, knowledge_links')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
