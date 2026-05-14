import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

function toSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('platform_knowledge')
    .select('id, title, slug, category, source_url, is_active, created_at, updated_at, content')
    .order('category',   { ascending: true,  nullsFirst: false })
    .order('title',      { ascending: true  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST — body: { title, content, category?, source_url?, slug? }
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const title   = typeof body.title   === 'string' ? body.title.trim()   : ''
  const content = typeof body.content === 'string' ? body.content        : ''
  if (!title)   return NextResponse.json({ error: 'title is required'   }, { status: 400 })
  if (!content) return NextResponse.json({ error: 'content is required' }, { status: 400 })

  const slug = typeof body.slug === 'string' && body.slug.trim() ? toSlug(body.slug) : toSlug(title)

  const admin = createAdminClient()
  const insert: Record<string, unknown> = { title, slug, content, created_by: session.user.id }
  if (typeof body.category   === 'string') insert.category   = body.category
  if (typeof body.source_url === 'string') insert.source_url = body.source_url
  if (typeof body.is_active  === 'boolean') insert.is_active = body.is_active

  const { data, error } = await admin
    .from('platform_knowledge')
    .insert(insert)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
