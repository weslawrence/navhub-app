// ============================================================
// Enums / unions
// ============================================================

export type UserRole = 'super_admin' | 'group_admin' | 'company_viewer' | 'division_viewer'
export type ReportType = 'profit_loss' | 'balance_sheet' | 'cashflow'
export type DataSource = 'xero' | 'excel'
export type UploadStatus = 'processing' | 'complete' | 'error'
export type SyncStatus = 'success' | 'error'
export type EntityType = 'company' | 'division'

// ============================================================
// Database row types
// ============================================================

export interface Group {
  id: string
  name: string
  slug: string
  primary_color: string
  created_at: string
}

export interface UserGroup {
  user_id: string
  group_id: string
  role: UserRole
  is_default: boolean
  group?: Group
}

export interface Company {
  id: string
  group_id: string
  name: string
  slug: string
  created_at: string
}

export interface Division {
  id: string
  company_id: string
  name: string
  slug: string
  created_at: string
}

export interface XeroConnection {
  id: string
  company_id: string | null
  division_id: string | null
  xero_tenant_id: string
  access_token: string
  refresh_token: string
  token_expiry: string
  connected_at: string
}

export interface FinancialSnapshot {
  id: string
  company_id: string | null
  division_id: string | null
  period: string
  report_type: ReportType
  source: DataSource
  data: FinancialData
  synced_at: string
}

export interface ExcelUpload {
  id: string
  company_id: string | null
  division_id: string | null
  filename: string
  storage_path: string
  uploaded_by: string
  uploaded_at: string
  status: UploadStatus
  error_message: string | null
}

export interface SyncLog {
  id: string
  company_id: string | null
  division_id: string | null
  source: DataSource
  status: SyncStatus
  message: string | null
  created_at: string
}

// ============================================================
// Financial data JSONB structure (stored in financial_snapshots.data)
// ============================================================

export interface FinancialData {
  period: string             // YYYY-MM
  report_type: ReportType
  currency: string           // ISO 4217, e.g. "AUD"
  rows: FinancialRow[]
  generated_at: string       // ISO 8601
}

export interface FinancialRow {
  account_id?: string
  account_code?: string
  account_name: string
  row_type: 'header' | 'row' | 'summaryRow' | 'section'
  amount_cents: number | null  // whole cents, null if not applicable
  children?: FinancialRow[]
}

// ============================================================
// API response types
// ============================================================

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
}
