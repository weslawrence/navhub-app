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

// POST — body: { is_published?: boolean } — defaults to toggling.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { /* allow empty body for toggle */ }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('agent_templates')
    .select('is_published')
    .eq('id', params.id)
    .single()
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const next = typeof body.is_published === 'boolean'
    ? body.is_published
    : !(current as { is_published: boolean }).is_published

  const { error } = await admin
    .from('agent_templates')
    .update({ is_published: next, updated_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { is_published: next } })
}
