import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET — single document ──────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  return NextResponse.json({ data })
}

// ─── PATCH — update document ────────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  // Verify ownership via RLS
  const { data: existing } = await supabase
    .from('documents')
    .select('id, content_markdown')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const admin = createAdminClient()

  // Auto-version if content is changing
  if (body.content_markdown !== undefined && body.content_markdown !== existing.content_markdown) {
    // Count existing versions to determine next version number
    const { count } = await admin
      .from('document_versions')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', params.id)

    void admin.from('document_versions').insert({
      document_id:      params.id,
      content_markdown: existing.content_markdown,
      version:          (count ?? 0) + 1,
      created_by:       session.user.id,
    })
  }

  const allowedFields = [
    'title', 'document_type', 'audience', 'content_markdown',
    'status', 'folder_id', 'company_id', 'locked_by', 'locked_at',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await admin
    .from('documents')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// ─── DELETE — delete document (admin only) ──────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  // Verify ownership + admin role
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()
  if (!existing) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', activeGroupId ?? '')
    .single()

  const isAdmin = membership?.role === 'super_admin' || membership?.role === 'group_admin'
  if (!isAdmin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const admin = createAdminClient()
  const { error } = await admin.from('documents').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: { deleted: true } })
}
