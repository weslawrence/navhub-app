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
  id:            string
  name:          string
  slug:          string
  primary_color: string
  palette_id:    string | null   // added Phase 2c — references PALETTES[].id
  created_at:    string
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
  description: string | null
  industry: string | null
  is_active: boolean
  created_at: string
}

export interface Division {
  id: string
  company_id: string
  name: string
  slug: string
  description: string | null
  industry: string | null
  is_active: boolean
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
// User settings
// ============================================================

export type NumberFormat = 'thousands' | 'full' | 'smart'
export type SupportedCurrency = 'AUD' | 'NZD' | 'USD' | 'GBP' | 'SGD'

export interface UserSettings {
  user_id:       string
  currency:      SupportedCurrency
  number_format: NumberFormat
  created_at:    string
  updated_at:    string
}

// ─── Dashboard summary types ────────────────────────────────────────────────

export interface AppSummary {
  company_count:       number
  division_count:      number
  active_agent_count:  number
  alert_count:         number
  companies_with_xero: number
  last_synced_at:      string | null
}

export interface CurrentPosition {
  cash:                          number | null
  receivables:                   number | null
  total_current_assets:          number | null
  total_non_current_assets:      number | null
  payables:                      number | null
  total_current_liabilities:     number | null
  total_non_current_liabilities: number | null
  net_position:                  number | null
  as_at_period:                  string
  companies_included:            number
  companies_missing_data:        number
}

export interface PLBlock {
  revenue:             number | null
  cogs:                number | null
  gross_profit:        number | null
  operating_expenses:  number | null
  ebitda:              number | null
  periods_included:    string[]
}

export interface Performance {
  qtd:      PLBlock
  last_qtr: PLBlock
  ytd:      PLBlock
}

export interface DashboardSummary {
  app_summary:       AppSummary
  current_position:  CurrentPosition
  performance:       Performance
}

// ============================================================
// Group management types  (Phase 2f)
// ============================================================

export interface GroupInvite {
  id:          string
  group_id:    string
  email:       string
  role:        string
  invited_by:  string
  accepted_at: string | null
  created_at:  string
}

export interface GroupMember {
  user_id:   string
  email:     string
  role:      string
  is_default: boolean
  joined_at: string
}

export interface CustomReport {
  id:          string
  group_id:    string
  name:        string
  description: string | null
  file_path:   string
  file_type:   string
  uploaded_by: string
  is_active:   boolean
  sort_order:  number
  created_at:  string
  updated_at:  string
}

// ============================================================
// Forecast types  (Phase 2e)
// ============================================================

export interface ForecastStream {
  id:                  string
  group_id:            string
  name:                string
  tag:                 string
  color:               string
  y1_baseline:         number   // cents
  default_growth_rate: number   // integer percentage, e.g. 20 = 20%
  default_gp_margin:   number   // integer percentage, e.g. 40 = 40%
  sort_order:          number
  is_active:           boolean
}

export interface ForecastUserState {
  year:    number
  showGP:  boolean
  showAll: boolean
  rates:   Record<string, { gr: number; gp: number }>
    // key = stream id; gr = growth rate %; gp = GP margin %
}

// ============================================================
// API response types
// ============================================================

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
}
