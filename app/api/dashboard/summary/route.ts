import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import {
  getCurrentQuarterMonths,
  getLastQuarterMonths,
  getYTDMonths,
  getCurrentPeriod,
} from '@/lib/utils'
import type { FinancialRow, DashboardSummary, PLBlock, CurrentPosition } from '@/lib/types'

// ─── Row extraction helpers ───────────────────────────────────────────────────

/**
 * Recursively search financial rows for the first match against a list of
 * lowercase name fragments. Prefers 'summaryRow' type over 'row' type.
 */
function extractValue(rows: FinancialRow[], patterns: string[]): number | null {
  let fallback: number | null = null

  for (const row of rows) {
    const nameLower = row.account_name.toLowerCase()
    const matches   = patterns.some(p => nameLower.includes(p))

    if (matches && row.amount_cents !== null) {
      if (row.row_type === 'summaryRow') return row.amount_cents
      if (fallback === null) fallback = row.amount_cents
    }

    if (row.children) {
      const childVal = extractValue(row.children, patterns)
      if (childVal !== null) return childVal
    }
  }
  return fallback
}

/** Sum a particular metric across multiple snapshots. Returns null if none found. */
function sumMetric(
  snapshots: { data: { rows: FinancialRow[] } }[],
  patterns: string[]
): number | null {
  let total: number | null = null
  for (const snap of snapshots) {
    const val = extractValue(snap.data.rows, patterns)
    if (val !== null) total = (total ?? 0) + val
  }
  return total
}

// ─── P&L patterns ────────────────────────────────────────────────────────────
// These match the standardised names output by Xero and the Excel upload route.

const PATTERNS = {
  revenue:    ['total revenue', 'total income', 'total operating revenue', 'revenue', 'income'],
  cogs:       ['total cost of goods sold', 'cost of goods sold', 'total cost of sales', 'cost of sales', 'cogs'],
  grossProfit:['gross profit'],
  opex:       ['total operating expenses', 'operating expenses', 'total expenses'],
  ebitda:     ['ebitda', 'earnings before interest'],
  // Balance sheet
  cash:       ['total cash', 'cash and cash equivalents', 'cash at bank', 'cash'],
  receivables:['total accounts receivable', 'accounts receivable', 'trade receivables', 'trade and other receivables'],
  curAssets:  ['total current assets'],
  nonCurAssets:['total non-current assets', 'total fixed assets', 'total non current assets'],
  payables:   ['total accounts payable', 'accounts payable', 'trade payables', 'trade and other payables'],
  curLiab:    ['total current liabilities'],
  nonCurLiab: ['total non-current liabilities', 'total non current liabilities'],
  netPosition:['net assets', 'total equity', 'equity'],
}

// ─── Rollup logic ─────────────────────────────────────────────────────────────

/**
 * For each company decide which snapshots to include:
 * - If any division under that company has snapshots for the given periods → use division snapshots
 * - Otherwise → use company-level snapshots
 * This prevents double-counting when both company and division data exists.
 */
function selectSnapshots(
  allSnapshots: {
    id: string
    company_id: string | null
    division_id: string | null
    period: string
    report_type: string
    data: { rows: FinancialRow[] }
  }[],
  companyIds: string[],
  periods: string[],
  reportType: 'profit_loss' | 'balance_sheet'
) {
  const result: typeof allSnapshots = []

  for (const companyId of companyIds) {
    const companySnaps  = allSnapshots.filter(s =>
      s.company_id === companyId &&
      s.division_id === null &&
      s.report_type === reportType &&
      periods.includes(s.period)
    )
    const divisionSnaps = allSnapshots.filter(s =>
      s.company_id === companyId &&
      s.division_id !== null &&
      s.report_type === reportType &&
      periods.includes(s.period)
    )

    // Prefer division data; fall back to company data
    if (divisionSnaps.length > 0) {
      result.push(...divisionSnaps)
    } else {
      result.push(...companySnaps)
    }
  }

  return result
}

// ─── Build a PLBlock ──────────────────────────────────────────────────────────

function buildPLBlock(
  allSnapshots: ReturnType<typeof selectSnapshots>,
  companyIds: string[],
  periods: string[]
): PLBlock {
  const snaps = selectSnapshots(allSnapshots as Parameters<typeof selectSnapshots>[0], companyIds, periods, 'profit_loss')

  const revenue   = sumMetric(snaps, PATTERNS.revenue)
  const cogs      = sumMetric(snaps, PATTERNS.cogs)
  const grossProfit = sumMetric(snaps, PATTERNS.grossProfit) ??
    (revenue !== null && cogs !== null ? revenue - cogs : null)
  const opex      = sumMetric(snaps, PATTERNS.opex)
  const ebitda    = sumMetric(snaps, PATTERNS.ebitda) ??
    (grossProfit !== null && opex !== null ? grossProfit - opex : null)

  return {
    revenue,
    cogs,
    gross_profit: grossProfit,
    operating_expenses: opex,
    ebitda,
    periods_included: periods,
  }
}

// ─── Build CurrentPosition ────────────────────────────────────────────────────

function buildCurrentPosition(
  allSnapshots: ReturnType<typeof selectSnapshots>,
  companyIds: string[],
  period: string
): CurrentPosition {
  const snaps = selectSnapshots(
    allSnapshots as Parameters<typeof selectSnapshots>[0],
    companyIds,
    [period],
    'balance_sheet'
  )

  // Track which companies have balance sheet data (avoid Set iteration for TS compat)
  const seenIds = snaps.map(s => s.company_id).filter(Boolean) as string[]
  const uniqueIds = seenIds.filter((id, i) => seenIds.indexOf(id) === i)
  const companiesIncluded = uniqueIds.length
  const companiesMissing  = companyIds.length - companiesIncluded

  return {
    cash:                          sumMetric(snaps, PATTERNS.cash),
    receivables:                   sumMetric(snaps, PATTERNS.receivables),
    total_current_assets:          sumMetric(snaps, PATTERNS.curAssets),
    total_non_current_assets:      sumMetric(snaps, PATTERNS.nonCurAssets),
    payables:                      sumMetric(snaps, PATTERNS.payables),
    total_current_liabilities:     sumMetric(snaps, PATTERNS.curLiab),
    total_non_current_liabilities: sumMetric(snaps, PATTERNS.nonCurLiab),
    net_position:                  sumMetric(snaps, PATTERNS.netPosition),
    as_at_period:                  period,
    companies_included:            companiesIncluded,
    companies_missing_data:        companiesMissing,
  }
}

// ─── GET /api/dashboard/summary ──────────────────────────────────────────────
// Returns aggregated financial metrics for the active group.
// Query params:
//   ?period=YYYY-MM  (defaults to current month)
export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url)
  const period           = searchParams.get('period') ?? getCurrentPeriod()

  // ── Load group's companies ──────────────────────────────────────────────────
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)

  const companyIds = (companies ?? []).map(c => c.id)

  // ── Load division counts ────────────────────────────────────────────────────
  const { data: divisions } = companyIds.length > 0
    ? await supabase
        .from('divisions')
        .select('id, company_id')
        .in('company_id', companyIds)
        .eq('is_active', true)
    : { data: [] }

  // ── Load Xero connection info ───────────────────────────────────────────────
  const { data: xeroConnections } = companyIds.length > 0
    ? await supabase
        .from('xero_connections')
        .select('id, company_id, division_id, updated_at')
        .or(`company_id.in.(${companyIds.join(',')}),division_id.in.(${(divisions ?? []).map(d => d.id).join(',')})`)
    : { data: [] }

  // Count distinct company IDs that have Xero connections (avoid Set iteration for TS compat)
  const xeroCompanyIds = (xeroConnections ?? []).map(c => c.company_id).filter(Boolean) as string[]
  const companiesWithXero = xeroCompanyIds.filter((id, i) => xeroCompanyIds.indexOf(id) === i).length

  const lastSyncedAt = (xeroConnections ?? []).reduce<string | null>((latest, c) => {
    if (!c.updated_at) return latest
    if (!latest)       return c.updated_at
    return c.updated_at > latest ? c.updated_at : latest
  }, null)

  // ── Load financial snapshots ────────────────────────────────────────────────
  // Determine all periods we need across QTD, last quarter, YTD, and current period
  const qtdPeriods     = getCurrentQuarterMonths(period)
  const lastQtrPeriods = getLastQuarterMonths(period)
  const ytdPeriods     = getYTDMonths(period)
  // Deduplicate periods without Set iteration (TS compat)
  const rawPeriods = [...qtdPeriods, ...lastQtrPeriods, ...ytdPeriods, period]
  const allPeriods = rawPeriods.filter((p, i) => rawPeriods.indexOf(p) === i)

  const divisionIds = (divisions ?? []).map(d => d.id)

  let allSnapshots: {
    id: string
    company_id: string | null
    division_id: string | null
    period: string
    report_type: string
    data: { rows: FinancialRow[] }
  }[] = []

  if (companyIds.length > 0 && allPeriods.length > 0) {
    // Fetch company-level snapshots
    const { data: companySnaps } = await supabase
      .from('financial_snapshots')
      .select('id, company_id, division_id, period, report_type, data')
      .in('company_id', companyIds)
      .is('division_id', null)
      .in('period', allPeriods)
      .in('report_type', ['profit_loss', 'balance_sheet'])

    // Fetch division-level snapshots (if any divisions exist)
    const { data: divisionSnaps } = divisionIds.length > 0
      ? await supabase
          .from('financial_snapshots')
          .select('id, company_id, division_id, period, report_type, data')
          .in('division_id', divisionIds)
          .in('period', allPeriods)
          .in('report_type', ['profit_loss', 'balance_sheet'])
      : { data: [] }

    allSnapshots = [...(companySnaps ?? []), ...(divisionSnaps ?? [])] as typeof allSnapshots
  }

  // ── Build response ──────────────────────────────────────────────────────────
  const appSummary = {
    company_count:       companyIds.length,
    division_count:      (divisions ?? []).length,
    active_agent_count:  0,
    alert_count:         0,
    companies_with_xero: companiesWithXero,
    last_synced_at:      lastSyncedAt,
  }

  const currentPosition = buildCurrentPosition(allSnapshots, companyIds, period)

  const performance = {
    qtd:      buildPLBlock(allSnapshots, companyIds, qtdPeriods),
    last_qtr: buildPLBlock(allSnapshots, companyIds, lastQtrPeriods),
    ytd:      buildPLBlock(allSnapshots, companyIds, ytdPeriods),
  }

  const summary: DashboardSummary = {
    app_summary:      appSummary,
    current_position: currentPosition,
    performance,
  }

  return NextResponse.json({ data: summary })
}
