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

// ── POST /api/admin/skills/[id]/publish ───────────────────────────────────────
// Body: { publish?: boolean }  default true
// Toggles is_published and bumps the version.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch { /* default to publish=true */ }
  const publish = body.publish !== false

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('skills')
    .select('version')
    .eq('id', params.id)
    .eq('tier', 'platform')
    .single()
  if (!current) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  const { data, error } = await admin
    .from('skills')
    .update({
      is_published: publish,
      version:      ((current as { version?: number }).version ?? 1) + 1,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('tier', 'platform')
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
