import { NextResponse }   from 'next/server'
import { createClient }  from '@/lib/supabase/server'
import { cookies }       from 'next/headers'
import { get13Weeks, buildForecastGrid } from '@/lib/cashflow'
import type { CashflowItem, CashflowSettings, CashflowXeroItem } from '@/lib/types'

export const runtime = 'nodejs'

// ─── GET /api/cashflow/[companyId]/forecast ───────────────────────────────────

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

  // Fetch settings (or use defaults)
  const { data: settingsRow } = await supabase
    .from('cashflow_settings')
    .select('*')
    .eq('company_id', params.companyId)
    .maybeSingle()

  const settings: CashflowSettings = settingsRow ?? {
    company_id:            params.companyId,
    opening_balance_cents: 0,
    week_start_day:        1,
    ar_lag_days:           30,
    ap_lag_days:           30,
    currency:              'AUD',
    updated_at:            new Date().toISOString(),
  }

  // Fetch active items + Xero items in parallel
  const [itemsResult, xeroResult] = await Promise.all([
    supabase
      .from('cashflow_items')
      .select('*')
      .eq('company_id', params.companyId)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('cashflow_xero_items')
      .select('*')
      .eq('company_id', params.companyId)
      .neq('sync_status', 'excluded'),
  ])

  if (itemsResult.error) return NextResponse.json({ error: itemsResult.error.message }, { status: 500 })

  const weeks = get13Weeks(settings.week_start_day)
  const grid  = buildForecastGrid({
    items:     (itemsResult.data ?? []) as CashflowItem[],
    settings,
    weeks,
    xeroItems: (xeroResult.data ?? []) as CashflowXeroItem[],
  })

  return NextResponse.json({ data: { grid, settings } })
}
