import { createAdminClient } from './supabase/admin'
import type { FinancialData, FinancialRow, ReportType } from './types'
import { getPeriodDateRange } from './utils'

// ============================================================
// Xero OAuth helpers
// ============================================================

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

export const XERO_SCOPES = [
  'openid',
  'profile',
  'email',
  'accounting.reports.profitandloss.read',
  'accounting.reports.balancesheet.read',
  'accounting.reports.tenninetynine.read',
  'accounting.settings.read',
  'accounting.transactions.read',   // Phase 4b — AR/AP invoices + bank accounts
  'offline_access',
].join(' ')

/** Build the Xero OAuth consent URL, encoding entity context in state */
export function buildXeroConsentUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.XERO_CLIENT_ID!,
    redirect_uri:  process.env.XERO_REDIRECT_URI!,
    scope:         XERO_SCOPES,
    state,
  })
  return `https://login.xero.com/identity/connect/authorize?${params}`
}

/** Exchange an OAuth code for tokens */
export async function exchangeXeroCode(code: string): Promise<XeroTokenResponse> {
  const credentials = Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      Authorization:   `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: process.env.XERO_REDIRECT_URI!,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Xero token exchange failed: ${res.status} ${body}`)
  }

  return res.json()
}

/** Get Xero tenant connections after OAuth */
export async function getXeroConnections(accessToken: string): Promise<XeroTenant[]> {
  const res = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Xero connections')
  return res.json()
}

// ============================================================
// Token management
// ============================================================

/**
 * Returns a valid access token for the given connection, refreshing
 * automatically if it expires within 5 minutes.
 */
export async function getValidToken(connectionId: string): Promise<{
  access_token: string
  xero_tenant_id: string
}> {
  const admin = createAdminClient()

  const { data: connection, error } = await admin
    .from('xero_connections')
    .select('*')
    .eq('id', connectionId)
    .single()

  if (error || !connection) {
    throw new Error(`Xero connection not found: ${connectionId}`)
  }

  const expiryMs     = new Date(connection.token_expiry).getTime()
  const fiveMinMs    = 5 * 60 * 1000
  const needsRefresh = expiryMs <= Date.now() + fiveMinMs

  if (!needsRefresh) {
    return {
      access_token:   connection.access_token,
      xero_tenant_id: connection.xero_tenant_id,
    }
  }

  // Refresh the token
  const credentials = Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:  `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: connection.refresh_token,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Xero token refresh failed: ${res.status} ${body}`)
  }

  const tokens: XeroTokenResponse = await res.json()
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  await admin
    .from('xero_connections')
    .update({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token ?? connection.refresh_token,
      token_expiry:  newExpiry,
    })
    .eq('id', connectionId)

  return {
    access_token:   tokens.access_token,
    xero_tenant_id: connection.xero_tenant_id,
  }
}

// ============================================================
// Report fetching
// ============================================================

/** Fetch a Xero report and return raw JSON */
export async function fetchXeroReport(
  accessToken: string,
  tenantId: string,
  reportType: ReportType,
  period: string
): Promise<XeroReportResponse> {
  const { fromDate, toDate } = getPeriodDateRange(period)

  const endpoint = REPORT_ENDPOINTS[reportType]
  const params   = REPORT_PARAMS[reportType](fromDate, toDate)

  const url = `${XERO_API_BASE}/${endpoint}?${params}`

  const res = await fetch(url, {
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept:           'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Xero ${reportType} fetch failed: ${res.status} ${body}`)
  }

  return res.json()
}

const REPORT_ENDPOINTS: Record<ReportType, string> = {
  profit_loss:   'Reports/ProfitAndLoss',
  balance_sheet: 'Reports/BalanceSheet',
  cashflow:      'Reports/CashSummary',
}

const REPORT_PARAMS: Record<ReportType, (from: string, to: string) => string> = {
  profit_loss:   (from, to) => new URLSearchParams({ fromDate: from, toDate: to }).toString(),
  balance_sheet: (_, to)    => new URLSearchParams({ date: to }).toString(),
  cashflow:      (from, to) => new URLSearchParams({ fromDate: from, toDate: to }).toString(),
}

// ============================================================
// Data normalisation
// ============================================================

/**
 * Converts a raw Xero report response into NavHub's standard JSONB structure.
 * Money values are stored as integer cents.
 */
export function normaliseFinancialData(
  xeroResponse: XeroReportResponse,
  reportType: ReportType,
  period: string
): FinancialData {
  const report     = xeroResponse.Reports?.[0]
  const currency   = report?.CurrencyCode ?? 'AUD'
  const rawRows    = report?.Rows ?? []

  return {
    period,
    report_type:   reportType,
    currency,
    rows:          parseRows(rawRows),
    generated_at:  new Date().toISOString(),
  }
}

function parseRows(rows: XeroRow[]): FinancialRow[] {
  return rows.flatMap((row): FinancialRow[] => {
    const cells      = row.Cells ?? []
    const nameCell   = cells[0]
    const valueCell  = cells[1]

    const name       = nameCell?.Value ?? row.Title ?? ''
    const amountStr  = valueCell?.Value ?? ''
    const amount     = parseFloat(amountStr.replace(/,/g, ''))
    const amountCents = isNaN(amount) ? null : Math.round(amount * 100)

    const rowType: FinancialRow['row_type'] =
      row.RowType === 'SummaryRow' ? 'summaryRow'
      : row.RowType === 'Section'  ? 'section'
      : row.RowType === 'Header'   ? 'header'
      : 'row'

    // Skip empty-name header rows with no value
    if (rowType === 'header' && !name) return []

    const result: FinancialRow = {
      account_name:  name,
      row_type:      rowType,
      amount_cents:  amountCents,
    }

    // Recurse into child rows (Sections contain Rows)
    if (row.Rows && row.Rows.length > 0) {
      result.children = parseRows(row.Rows)
    }

    return [result]
  })
}

// ============================================================
// Phase 4b — AR/AP invoices + bank accounts
// ============================================================

export interface XeroInvoice {
  InvoiceID:    string
  Contact:      { Name: string }
  DueDate:      string    // "/Date(timestamp)/" format
  AmountDue:    number    // in dollars (Xero returns dollars, not cents)
  Type:         'ACCREC' | 'ACCPAY'
  Status:       string
}

export interface XeroBankAccount {
  AccountID:    string
  Name:         string
  Code:         string
  Type:         string
}

/**
 * Fetch outstanding AR or AP invoices for a Xero org.
 * invoiceType: 'ACCREC' (Accounts Receivable) or 'ACCPAY' (Accounts Payable)
 */
export async function getOutstandingInvoices(
  accessToken:   string,
  tenantId:      string,
  invoiceType:   'ACCREC' | 'ACCPAY'
): Promise<XeroInvoice[]> {
  const params = new URLSearchParams({
    Type:     invoiceType,
    Statuses: 'AUTHORISED,SUBMITTED',
  })
  const url = `${XERO_API_BASE}/Invoices?${params}`

  const res = await fetch(url, {
    headers: {
      Authorization:    `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept:           'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Xero Invoices (${invoiceType}) fetch failed: ${res.status} ${body}`)
  }

  const data = await res.json()
  return (data.Invoices ?? []) as XeroInvoice[]
}

/** Parse Xero's "/Date(1234567890000)/" timestamp format to ISO date string */
export function parseXeroDate(xeroDate: string): string | null {
  const match = /\/Date\((\d+)\)\//.exec(xeroDate)
  if (!match) return null
  return new Date(Number(match[1])).toISOString().split('T')[0]
}

/**
 * Fetch bank accounts (Type=BANK, Status=ACTIVE) from Xero org.
 */
export async function getBankAccounts(
  accessToken: string,
  tenantId:    string
): Promise<XeroBankAccount[]> {
  const params = new URLSearchParams({ Type: 'BANK', Status: 'ACTIVE' })
  const url    = `${XERO_API_BASE}/Accounts?${params}`

  const res = await fetch(url, {
    headers: {
      Authorization:    `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept:           'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Xero bank accounts fetch failed: ${res.status} ${body}`)
  }

  const data = await res.json()
  return (data.Accounts ?? []) as XeroBankAccount[]
}

/**
 * Fetch the current balance for a specific bank account via the BankSummary report.
 * Returns balance in cents (integer), or null if not found.
 */
export async function getBankBalance(
  accessToken:   string,
  tenantId:      string,
  bankAccountId: string
): Promise<number | null> {
  const url = `${XERO_API_BASE}/Reports/BankSummary`

  const res = await fetch(url, {
    headers: {
      Authorization:    `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept:           'application/json',
    },
  })

  if (!res.ok) return null

  const data = await res.json()
  const rows: XeroRow[] = data.Reports?.[0]?.Rows ?? []

  for (const row of rows) {
    for (const child of row.Rows ?? []) {
      // Each child row: Cells[0] = account name/id, Cells[1] = closing balance
      const attrs = child.Cells?.[0]?.Attributes ?? []
      const idAttr = attrs.find((a: { Id: string; Value: string }) => a.Id === 'account')
      if (idAttr?.Value === bankAccountId) {
        const val = parseFloat((child.Cells?.[1]?.Value ?? '').replace(/,/g, ''))
        if (!isNaN(val)) return Math.round(val * 100)
      }
    }
  }

  return null
}

// ============================================================
// Internal Xero API types
// ============================================================

interface XeroTokenResponse {
  access_token:  string
  refresh_token: string
  expires_in:    number
  token_type:    string
}

interface XeroTenant {
  id:         string
  tenantId:   string
  tenantType: string
  tenantName: string
}

interface XeroCell {
  Value:       string
  Attributes?: Array<{ Id: string; Value: string }>
}

interface XeroRow {
  RowType: 'Header' | 'Row' | 'SummaryRow' | 'Section'
  Title?:  string
  Cells?:  XeroCell[]
  Rows?:   XeroRow[]
}

interface XeroReportResponse {
  Reports?: Array<{
    ReportID:     string
    ReportName:   string
    CurrencyCode: string
    Rows:         XeroRow[]
  }>
}
