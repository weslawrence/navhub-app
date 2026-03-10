import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'

export const runtime = 'nodejs'

// ─── GET /api/cashflow/[companyId]/snapshots/[snapshotId] ─────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { companyId: string; snapshotId: string } }
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

  const { data, error } = await supabase
    .from('cashflow_snapshots')
    .select('*')
    .eq('id', params.snapshotId)
    .eq('company_id', params.companyId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 })
  return NextResponse.json({ data })
}

// ─── DELETE /api/cashflow/[companyId]/snapshots/[snapshotId] ──────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: { companyId: string; snapshotId: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: co } = await supabase
    .from('companies')
    .select('id')
    .eq('id', params.companyId)
    .eq('group_id', activeGroupId ?? '')
    .single()
  if (!co) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('cashflow_snapshots')
    .delete()
    .eq('id', params.snapshotId)
    .eq('company_id', params.companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id: params.snapshotId } })
}
