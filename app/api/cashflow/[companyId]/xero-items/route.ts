import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── PATCH /api/cashflow/[companyId]/xero-items ───────────────────────────────
// Update sync_status (and optional override fields) for a Xero invoice item.
// Body: { xero_invoice_id: string, sync_status: string, overridden_week?: string, overridden_amount?: number }

export async function PATCH(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Verify company belongs to active group
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', params.companyId)
    .eq('group_id', activeGroupId ?? '')
    .single()

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  let body: {
    xero_invoice_id:   string
    sync_status:       'synced' | 'overridden' | 'excluded' | 'pending'
    overridden_week?:  string | null
    overridden_amount?: number | null
  }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.xero_invoice_id) {
    return NextResponse.json({ error: 'xero_invoice_id is required' }, { status: 400 })
  }

  const valid = ['synced', 'overridden', 'excluded', 'pending']
  if (!valid.includes(body.sync_status)) {
    return NextResponse.json({ error: `sync_status must be one of: ${valid.join(', ')}` }, { status: 422 })
  }

  const admin   = createAdminClient()
  const updates: Record<string, unknown> = { sync_status: body.sync_status }

  if (body.sync_status === 'overridden') {
    updates.overridden_week   = body.overridden_week   ?? null
    updates.overridden_amount = body.overridden_amount ?? null
    updates.is_overridden     = true
  } else if (body.sync_status === 'synced') {
    updates.overridden_week   = null
    updates.overridden_amount = null
    updates.is_overridden     = false
  }

  const { data, error } = await admin
    .from('cashflow_xero_items')
    .update(updates)
    .eq('company_id', params.companyId)
    .eq('xero_invoice_id', body.xero_invoice_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
