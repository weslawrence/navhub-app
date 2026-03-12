import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const LOCK_DURATION_MS = 30 * 60 * 1000 // 30 minutes

// ─── POST — acquire edit lock ───────────────────────────────────────────────

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  // Verify document belongs to active group
  const { data: doc } = await supabase
    .from('documents')
    .select('id, locked_by, locked_at')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const now = Date.now()

  // If locked by another user and lock is still fresh, reject
  if (
    doc.locked_by &&
    doc.locked_by !== session.user.id &&
    doc.locked_at &&
    now - new Date(doc.locked_at as string).getTime() < LOCK_DURATION_MS
  ) {
    return NextResponse.json({
      error:     'Document is currently locked by another user',
      locked_by: doc.locked_by,
      locked_at: doc.locked_at,
    }, { status: 409 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('documents')
    .update({ locked_by: session.user.id, locked_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('locked_by, locked_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// ─── DELETE — release edit lock ─────────────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: doc } = await supabase
    .from('documents')
    .select('id, locked_by')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  // Only the lock holder can release
  if (doc.locked_by !== session.user.id) {
    return NextResponse.json({ error: 'You do not hold the lock on this document' }, { status: 403 })
  }

  const admin = createAdminClient()
  await admin
    .from('documents')
    .update({ locked_by: null, locked_at: null })
    .eq('id', params.id)

  return NextResponse.json({ data: { released: true } })
}
