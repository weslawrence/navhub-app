import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getValidToken,
  fetchXeroReport,
  normaliseFinancialData,
} from '@/lib/xero'
import { getCurrentPeriod } from '@/lib/utils'
import type { ReportType }  from '@/lib/types'

// ─── POST /api/xero/sync/all ─────────────────────────────────────────────────
// Syncs Xero data for all connections in the active group.
// Body (optional): { period?: string }  e.g. { period: "2026-01" }
//   - If period is provided → sync only that one period.
//   - If omitted → sync the last 3 months (default).
// Loops over: all connections × period(s) × 3 report types.
// Returns { synced: number, errors: string[] }

const REPORT_TYPES: ReportType[] = ['profit_loss', 'balance_sheet', 'cashflow']

/** Returns YYYY-MM strings for the last `n` months from `fromPeriod` (inclusive) */
function lastNMonths(fromPeriod: string, n: number): string[] {
  const parts = fromPeriod.split('-')
  let year    = parseInt(parts[0], 10)
  let month   = parseInt(parts[1], 10)
  const result: string[] = []
  for (let i = 0; i < n; i++) {
    result.push(`${year}-${String(month).padStart(2, '0')}`)
    month--
    if (month === 0) { month = 12; year-- }
  }
  return result
}

export async function POST(request: Request) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  if (!activeGroupId) {
    return NextResponse.json({ error: 'No active group' }, { status: 400 })
  }

  // Optional body: { period?: string }
  let requestedPeriod: string | undefined
  try {
    const body = await request.json() as { period?: string }
    if (typeof body.period === 'string' && /^\d{4}-\d{2}$/.test(body.period)) {
      requestedPeriod = body.period
    }
  } catch {
    // No body / invalid JSON — use default (last 3 months)
  }

  // ── Find all companies + divisions for this group ───────────────────────

  const { data: companies } = await supabase
    .from('companies')
    .select('id')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)

  const companyIds = (companies ?? []).map(c => c.id)

  if (companyIds.length === 0) {
    return NextResponse.json({ data: { synced: 0, errors: [] } })
  }

  const { data: divisions } = await supabase
    .from('divisions')
    .select('id')
    .in('company_id', companyIds)
    .eq('is_active', true)

  const divisionIds = (divisions ?? []).map(d => d.id)

  // ── Fetch all xero_connections for this group ───────────────────────────

  const admin = createAdminClient()

  const orParts: string[] = [`company_id.in.(${companyIds.join(',')})`]
  if (divisionIds.length > 0) {
    orParts.push(`division_id.in.(${divisionIds.join(',')})`)
  }

  const { data: connections } = await admin
    .from('xero_connections')
    .select('id, company_id, division_id')
    .or(orParts.join(','))

  if (!connections || connections.length === 0) {
    return NextResponse.json({ data: { synced: 0, errors: [] } })
  }

  // ── Sync each connection × period × report_type ─────────────────────────

  // Use requested period OR fall back to last 3 months
  const periods = requestedPeriod
    ? [requestedPeriod]
    : lastNMonths(getCurrentPeriod(), 3)
  let   syncedCount = 0
  const errors:   string[] = []

  for (const connection of connections) {
    for (const period of periods) {
      for (const reportType of REPORT_TYPES) {
        try {
          // Get valid (possibly refreshed) Xero token
          const { access_token, xero_tenant_id } = await getValidToken(connection.id)

          // Fetch report from Xero API
          const xeroData      = await fetchXeroReport(access_token, xero_tenant_id, reportType, period)
          const financialData = normaliseFinancialData(xeroData, reportType, period)

          // Upsert snapshot
          const snapshotRecord = {
            period,
            report_type: reportType,
            source:      'xero' as const,
            data:        financialData,
            synced_at:   new Date().toISOString(),
            company_id:  connection.company_id,
            division_id: connection.division_id,
          }

          const { error: snapshotError } = await admin
            .from('financial_snapshots')
            .upsert(snapshotRecord, {
              onConflict: connection.company_id
                ? 'company_id,period,report_type,source'
                : 'division_id,period,report_type,source',
            })

          if (snapshotError) throw new Error(snapshotError.message)

          // Log success (fire-and-forget — non-fatal)
          void admin.from('sync_logs').insert({
            source:      'xero',
            status:      'success',
            message:     `${reportType} synced for ${period}`,
            company_id:  connection.company_id,
            division_id: connection.division_id,
          })

          syncedCount++

        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          errors.push(`conn:${connection.id} ${reportType} ${period} — ${message}`)

          // Log error (fire-and-forget — non-fatal)
          void admin.from('sync_logs').insert({
            source:      'xero',
            status:      'error',
            message:     `${reportType} sync failed for ${period}: ${message}`,
            company_id:  connection.company_id,
            division_id: connection.division_id,
          })
        }
      }
    }
  }

  return NextResponse.json({ data: { synced: syncedCount, errors } })
}
