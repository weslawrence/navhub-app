import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'

export const runtime = 'nodejs'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function verifyCompanyAccess(companyId: string, activeGroupId: string | undefined) {
  const supabase = createClient()
  const { data } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('group_id', activeGroupId ?? '')
    .single()
  return !!data
}

// ─── GET /api/cashflow/[companyId]/settings ───────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: { companyId: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const ok = await verifyCompanyAccess(params.companyId, activeGroupId)
  if (!ok) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const { data: existing } = await supabase
    .from('cashflow_settings')
    .select('*')
    .eq('company_id', params.companyId)
    .maybeSingle()

  // Return defaults if no row yet
  const defaults = {
    company_id:            params.companyId,
    opening_balance_cents: 0,
    week_start_day:        1,   // Monday
    ar_lag_days:           30,
    ap_lag_days:           30,
    currency:              'AUD',
    updated_at:            new Date().toISOString(),
  }

  return NextResponse.json({ data: existing ?? defaults })
}

// ─── PATCH /api/cashflow/[companyId]/settings ─────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const ok = await verifyCompanyAccess(params.companyId, activeGroupId)
  if (!ok) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowedFields = ['opening_balance_cents', 'week_start_day', 'ar_lag_days', 'ap_lag_days', 'currency']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key]
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cashflow_settings')
    .upsert({ company_id: params.companyId, ...updates }, { onConflict: 'company_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
