import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET — fetch single conversation (with messages) ─────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('assistant_conversations')
    .select('id, title, messages, updated_at')
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ data })
}

// ─── PATCH — update messages + auto-title ────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { messages?: unknown[]; title?: string } = {}
  try { body = await request.json() as typeof body } catch { /* ignore */ }

  // Auto-generate title from first user message if not provided
  let title: string | undefined = body.title
  if (!title && Array.isArray(body.messages)) {
    const firstUserMsg = body.messages.find(
      (m): m is { role: string; content: string } =>
        typeof m === 'object' && m !== null && (m as { role?: string }).role === 'user',
    )
    if (firstUserMsg?.content) {
      title = firstUserMsg.content.slice(0, 60)
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.messages !== undefined) updates.messages = body.messages
  if (title)                        updates.title    = title

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('assistant_conversations')
    .update(updates)
    .eq('id', params.id)
    .eq('user_id', session.user.id)
    .select('id, title, updated_at')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found or update failed' }, { status: 404 })

  return NextResponse.json({ data })
}

// ─── DELETE — hard delete conversation ──────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('assistant_conversations')
    .delete()
    .eq('id', params.id)
    .eq('user_id', session.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
