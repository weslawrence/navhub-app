import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET /api/admin/groups/[id]/members ──────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()

  const { data: sa } = await admin
    .from('user_groups').select('role').eq('user_id', session.user.id).eq('role', 'super_admin')
  if (!sa || sa.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: memberships } = await admin
    .from('user_groups')
    .select('user_id, role, is_default, created_at')
    .eq('group_id', params.id)
    .order('created_at')

  if (!memberships || memberships.length === 0) return NextResponse.json({ data: [] })

  // Enrich with auth emails in parallel
  const enriched = await Promise.all(
    (memberships as Array<{ user_id: string; role: string; is_default: boolean; created_at: string }>).map(async (m) => {
      try {
        const { data: user } = await admin.auth.admin.getUserById(m.user_id)
        return {
          user_id:         m.user_id,
          email:           user?.user?.email ?? m.user_id,
          role:            m.role,
          is_default:      m.is_default,
          joined_at:       m.created_at,
          last_sign_in_at: user?.user?.last_sign_in_at ?? null,
        }
      } catch {
        return {
          user_id: m.user_id, email: m.user_id, role: m.role,
          is_default: m.is_default, joined_at: m.created_at, last_sign_in_at: null,
        }
      }
    })
  )

  return NextResponse.json({ data: enriched })
}
