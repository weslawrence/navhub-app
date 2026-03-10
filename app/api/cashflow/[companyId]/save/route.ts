import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'

export const runtime = 'nodejs'

// ─── POST /api/cashflow/[companyId]/save ──────────────────────────────────────
// Auto-save current forecast grid state (upsert)

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Verify company belongs to active group
  const { data: co } = await supabase
    .from('companies')
    .select('id')
    .eq('id', params.companyId)
    .eq('group_id', activeGroupId ?? '')
    .single()
  if (!co) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { grid_data } = body
  if (!grid_data) return NextResponse.json({ error: 'grid_data required' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cashflow_forecasts')
    .upsert(
      { company_id: params.companyId, grid_data, saved_at: new Date().toISOString() },
      { onConflict: 'company_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
