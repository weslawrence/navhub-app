import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'

export const runtime = 'nodejs'

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

// ─── GET /api/cashflow/[companyId]/items ──────────────────────────────────────

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

  const { data, error } = await supabase
    .from('cashflow_items')
    .select('*')
    .eq('company_id', params.companyId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// ─── POST /api/cashflow/[companyId]/items ─────────────────────────────────────

export async function POST(
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

  const { label, section, amount_cents, recurrence, start_date, end_date, day_of_week, day_of_month } = body as Record<string, unknown>

  if (!label || !section || amount_cents === undefined || !recurrence || !start_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const validSections    = ['inflow', 'regular_outflow', 'payable']
  const validRecurrences = ['weekly', 'fortnightly', 'monthly', 'one_off']
  if (!validSections.includes(section as string)) {
    return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
  }
  if (!validRecurrences.includes(recurrence as string)) {
    return NextResponse.json({ error: 'Invalid recurrence' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cashflow_items')
    .insert({
      company_id:    params.companyId,
      label,
      section,
      amount_cents:  Number(amount_cents),
      recurrence,
      start_date,
      end_date:      end_date ?? null,
      day_of_week:   day_of_week !== undefined ? Number(day_of_week) : null,
      day_of_month:  day_of_month !== undefined ? Number(day_of_month) : null,
      pending_review: false,
      is_active:     true,
      updated_at:    new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
