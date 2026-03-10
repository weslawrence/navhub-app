import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'

export const runtime = 'nodejs'

async function verifyItemAccess(
  companyId: string,
  itemId: string,
  activeGroupId: string | undefined
) {
  const supabase = createClient()
  // Verify company belongs to active group
  const { data: co } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('group_id', activeGroupId ?? '')
    .single()
  if (!co) return false

  // Verify item belongs to company
  const { data: item } = await supabase
    .from('cashflow_items')
    .select('id')
    .eq('id', itemId)
    .eq('company_id', companyId)
    .single()
  return !!item
}

// ─── PATCH /api/cashflow/[companyId]/items/[id] ───────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: { companyId: string; id: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const ok = await verifyItemAccess(params.companyId, params.id, activeGroupId)
  if (!ok) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowedFields = [
    'label', 'section', 'amount_cents', 'recurrence',
    'start_date', 'end_date', 'day_of_week', 'day_of_month',
    'pending_review', 'is_active',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key]
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cashflow_items')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// ─── DELETE /api/cashflow/[companyId]/items/[id] ──────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: { companyId: string; id: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const ok = await verifyItemAccess(params.companyId, params.id, activeGroupId)
  if (!ok) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('cashflow_items')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { id: params.id } })
}
