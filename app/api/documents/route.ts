import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DocumentType, DocumentAudience } from '@/lib/types'

// ─── GET — list documents ───────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase     = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore  = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const url    = new URL(request.url)
  const folder = url.searchParams.get('folder_id')
  const company = url.searchParams.get('company_id')
  const docType = url.searchParams.get('document_type')
  const status  = url.searchParams.get('status')

  // Check user role for status filtering
  const { data: membership } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('group_id', activeGroupId)
    .single()

  const userRole = membership?.role ?? 'viewer'

  let query = supabase
    .from('documents')
    .select('*')
    .eq('group_id', activeGroupId)
    .order('updated_at', { ascending: false })

  if (folder === 'unfiled') query = query.is('folder_id', null)
  else if (folder)           query = query.eq('folder_id', folder)
  if (company)               query = query.eq('company_id', company)
  if (docType)               query = query.eq('document_type', docType)
  if (status)                query = query.eq('status', status)

  // Viewers can only see published documents
  if (userRole === 'viewer') {
    query = query.eq('status', 'published')
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch locked_by email for locked documents
  const lockedIds = (data ?? [])
    .filter((d: { locked_by: string | null }) => d.locked_by)
    .map((d: { locked_by: string }) => d.locked_by)

  const emailMap: Record<string, string> = {}
  if (lockedIds.length > 0) {
    const admin = createAdminClient()
    await Promise.all(lockedIds.map(async (uid: string) => {
      try {
        const { data: u } = await admin.auth.admin.getUserById(uid)
        if (u.user?.email) emailMap[uid] = u.user.email
      } catch { /* skip */ }
    }))
  }

  const enriched = (data ?? []).map((d: Record<string, unknown>) => ({
    ...d,
    locked_by_email: d.locked_by ? (emailMap[d.locked_by as string] ?? null) : null,
  }))

  return NextResponse.json({ data: enriched })
}

// ─── POST — create document ─────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { title, document_type, audience, folder_id, company_id, content_markdown } = body

  if (!title || !document_type || !audience) {
    return NextResponse.json({ error: 'title, document_type, and audience are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('documents').insert({
    group_id:         activeGroupId,
    company_id:       company_id ?? null,
    folder_id:        folder_id ?? null,
    title:            title as string,
    document_type:    document_type as DocumentType,
    audience:         audience as DocumentAudience,
    content_markdown: (content_markdown as string) ?? '',
    created_by:       session.user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
