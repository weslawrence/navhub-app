import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET — list conversations (last 20, newest first) ────────────────────────

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore  = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('assistant_conversations')
    .select('id, title, updated_at')
    .eq('user_id', session.user.id)
    .eq('group_id', activeGroupId)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}

// ─── POST — create new conversation ─────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  let body: { title?: string } = {}
  try { body = await request.json() as { title?: string } } catch { /* use defaults */ }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('assistant_conversations')
    .insert({
      group_id: activeGroupId,
      user_id:  session.user.id,
      title:    (body.title ?? 'New Conversation').slice(0, 100),
      messages: [],
    })
    .select('id, title, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data }, { status: 201 })
}
