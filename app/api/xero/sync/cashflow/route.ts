import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidToken, fetchXeroReport, normaliseFinancialData } from '@/lib/xero'

export async function POST(request: NextRequest) {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { connection_id, period } = body

  if (!connection_id || typeof connection_id !== 'string') {
    return NextResponse.json({ error: 'connection_id is required.' }, { status: 400 })
  }
  if (!period || typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period must be YYYY-MM.' }, { status: 400 })
  }

  const { data: connection } = await supabase
    .from('xero_connections')
    .select('id, company_id, division_id')
    .eq('id', connection_id)
    .single()

  if (!connection) {
    return NextResponse.json({ error: 'Connection not found or access denied.' }, { status: 404 })
  }

  const admin = createAdminClient()

  try {
    const { access_token, xero_tenant_id } = await getValidToken(connection_id)
    const xeroData = await fetchXeroReport(access_token, xero_tenant_id, 'cashflow', period)
    const financialData = normaliseFinancialData(xeroData, 'cashflow', period)

    const { data: snapshot, error: snapshotError } = await admin
      .from('financial_snapshots')
      .upsert(
        {
          period,
          report_type: 'cashflow' as const,
          source:      'xero' as const,
          data:        financialData,
          synced_at:   new Date().toISOString(),
          company_id:  connection.company_id,
          division_id: connection.division_id,
        },
        {
          onConflict: connection.company_id
            ? 'company_id,period,report_type,source'
            : 'division_id,period,report_type,source',
        }
      )
      .select()
      .single()

    if (snapshotError) throw new Error(snapshotError.message)

    await admin.from('sync_logs').insert({
      source: 'xero', status: 'success',
      message: `Cash Flow synced for ${period}`,
      company_id: connection.company_id, division_id: connection.division_id,
    })

    return NextResponse.json({ data: snapshot })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await admin.from('sync_logs').insert({
      source: 'xero', status: 'error',
      message: `Cash Flow sync failed: ${message}`,
      company_id: connection.company_id, division_id: connection.division_id,
    })
    console.error('Cash Flow sync error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
