import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

// ─── GET /api/admin/audit ─────────────────────────────────────────────────────
// Returns paginated audit log entries enriched with actor emails.
export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const page    = Math.max(1, parseInt(searchParams.get('page')    ?? '1', 10))
  const limit   = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))
  const action  = searchParams.get('action')
  const entity  = searchParams.get('entity_type')
  const offset  = (page - 1) * limit

  const admin = createAdminClient()

  let query = admin
    .from('admin_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (action)  query = query.eq('action',      action)
  if (entity)  query = query.eq('entity_type', entity)

  const { data: entries, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with actor emails
  const actorIds = Array.from(new Set(
    (entries ?? [])
      .map((e: { actor_id: string | null }) => e.actor_id)
      .filter(Boolean) as string[]
  ))

  const emailMap: Record<string, string> = {}
  if (actorIds.length > 0) {
    // Fetch in batches if needed
    const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    for (const u of users) {
      if (actorIds.includes(u.id)) {
        emailMap[u.id] = u.email ?? u.id
      }
    }
  }

  type AuditEntry = {
    id: string; actor_id: string | null; action: string
    entity_type: string; entity_id: string | null
    metadata: Record<string, unknown> | null; created_at: string
  }

  const data = (entries ?? [] as AuditEntry[]).map((e: AuditEntry) => ({
    ...e,
    actor_email: e.actor_id ? (emailMap[e.actor_id] ?? e.actor_id) : null,
  }))

  return NextResponse.json({
    data,
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
  })
}
