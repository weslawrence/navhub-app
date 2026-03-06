import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidToken, fetchXeroReport, normaliseFinancialData } from '@/lib/xero'

export async function POST(request: NextRequest) {
  const supabase = createClient()

  // ── Auth ──────────────────────────────────────────────────
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // ── Body ──────────────────────────────────────────────────
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

  // ── Verify connection access ──────────────────────────────
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
    // ── Get valid token ────────────────────────────────────
    const { access_token, xero_tenant_id } = await getValidToken(connection_id)

    // ── Fetch report ───────────────────────────────────────
    const xeroData = await fetchXeroReport(access_token, xero_tenant_id, 'profit_loss', period)

    // ── Normalise ──────────────────────────────────────────
    const financialData = normaliseFinancialData(xeroData, 'profit_loss', period)

    // ── Upsert snapshot ────────────────────────────────────
    const snapshotRecord = {
      period,
      report_type: 'profit_loss' as const,
      source:      'xero' as const,
      data:        financialData,
      synced_at:   new Date().toISOString(),
      company_id:  connection.company_id,
      division_id: connection.division_id,
    }

    const { data: snapshot, error: snapshotError } = await admin
      .from('financial_snapshots')
      .upsert(snapshotRecord, {
        onConflict: connection.company_id
          ? 'company_id,period,report_type,source'
          : 'division_id,period,report_type,source',
      })
      .select()
      .single()

    if (snapshotError) throw new Error(snapshotError.message)

    // ── Log success ────────────────────────────────────────
    await admin.from('sync_logs').insert({
      source:      'xero',
      status:      'success',
      message:     `P&L synced for ${period}`,
      company_id:  connection.company_id,
      division_id: connection.division_id,
    })

    return NextResponse.json({ data: snapshot })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    await admin.from('sync_logs').insert({
      source:      'xero',
      status:      'error',
      message:     `P&L sync failed: ${message}`,
      company_id:  connection.company_id,
      division_id: connection.division_id,
    })

    console.error('P&L sync error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
