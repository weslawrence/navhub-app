import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidToken, fetchXeroReport, normaliseFinancialData } from '@/lib/xero'
import { getLastNMonths } from '@/lib/utils'
import type { ReportType } from '@/lib/types'

const REPORT_TYPES: ReportType[] = ['profit_loss', 'balance_sheet', 'cashflow']
const MONTHS_TO_SYNC = 3

export async function GET(request: NextRequest) {
  // ── Validate cron secret ──────────────────────────────────
  const authHeader = request.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin   = createAdminClient()
  const periods = getLastNMonths(MONTHS_TO_SYNC)

  // Load all active Xero connections
  const { data: connections, error: connError } = await admin
    .from('xero_connections')
    .select('id, company_id, division_id')

  if (connError) {
    return NextResponse.json({ error: connError.message }, { status: 500 })
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({ data: { synced: 0, errors: 0, message: 'No connections found.' } })
  }

  let synced = 0
  let errors = 0
  const errorLog: string[] = []

  for (const connection of connections) {
    let token: { access_token: string; xero_tenant_id: string }

    try {
      token = await getValidToken(connection.id)
    } catch (err) {
      const msg = `Connection ${connection.id}: token refresh failed — ${err instanceof Error ? err.message : 'unknown'}`
      console.error(msg)
      errorLog.push(msg)
      errors++

      await admin.from('sync_logs').insert({
        source:      'xero',
        status:      'error',
        message:     msg,
        company_id:  connection.company_id,
        division_id: connection.division_id,
      })
      continue
    }

    for (const period of periods) {
      for (const reportType of REPORT_TYPES) {
        try {
          const xeroData      = await fetchXeroReport(token.access_token, token.xero_tenant_id, reportType, period)
          const financialData = normaliseFinancialData(xeroData, reportType, period)

          await admin
            .from('financial_snapshots')
            .upsert(
              {
                period,
                report_type: reportType,
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

          await admin.from('sync_logs').insert({
            source:      'xero',
            status:      'success',
            message:     `Cron: ${reportType} synced for ${period}`,
            company_id:  connection.company_id,
            division_id: connection.division_id,
          })

          synced++
        } catch (err) {
          const msg = `Connection ${connection.id} / ${reportType} / ${period}: ${err instanceof Error ? err.message : 'unknown'}`
          console.error(msg)
          errorLog.push(msg)
          errors++

          await admin.from('sync_logs').insert({
            source:      'xero',
            status:      'error',
            message:     msg,
            company_id:  connection.company_id,
            division_id: connection.division_id,
          })
        }
      }
    }
  }

  return NextResponse.json({
    data: {
      synced,
      errors,
      connections_processed: connections.length,
      periods,
      error_details: errorLog.length > 0 ? errorLog : undefined,
    },
  })
}
