import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'

export const runtime = 'nodejs'

// ─── POST /api/cashflow/[companyId]/snapshot ──────────────────────────────────
// Create a named snapshot of the current forecast grid

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

  const { name, notes, grid_data } = body as { name?: string; notes?: string; grid_data?: unknown }
  if (!name || !grid_data) {
    return NextResponse.json({ error: 'name and grid_data are required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cashflow_snapshots')
    .insert({
      company_id: params.companyId,
      name,
      notes:      notes ?? null,
      grid_data,
      created_by: session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
