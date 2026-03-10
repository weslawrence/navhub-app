import { NextResponse }  from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies }      from 'next/headers'

export const runtime = 'nodejs'

// ─── GET /api/cashflow/[companyId]/snapshots ──────────────────────────────────

export async function GET(
  _request: Request,
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

  // Return list without grid_data (too large; fetch individually)
  const { data, error } = await supabase
    .from('cashflow_snapshots')
    .select('id, company_id, name, notes, created_by, created_at')
    .eq('company_id', params.companyId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
