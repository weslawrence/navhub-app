// ============================================================
// Enums / unions
// ============================================================

export type UserRole = 'super_admin' | 'group_admin' | 'company_viewer' | 'division_viewer'
export type ReportType = 'profit_loss' | 'balance_sheet' | 'cashflow'
export type DataSource = 'xero' | 'excel'
export type UploadStatus = 'processing' | 'complete' | 'error' | 'processed'
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
  id:             string
  company_id:     string | null
  division_id:    string | null
  filename:       string
  storage_path:   string
  uploaded_by:    string
  uploaded_at:    string
  status:         UploadStatus
  error_message:  string | null
  // Phase 3b additions
  report_type?:   'pl' | 'bs' | 'tb' | null
  period_value?:  string | null
  column_mapping?: Record<string, string> | null
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
  fy_end_month:  number    // 1–12; 6 = June (AU standard), Phase 3b
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
// Agent types  (Phase 3a)
// ============================================================

export type AgentModel =
  | 'claude-sonnet-4-20250514'
  | 'claude-opus-4-20250514'
  | 'gpt-4o'

export type AgentTool =
  | 'read_financials'
  | 'read_companies'
  | 'generate_report'
  | 'send_slack'
  | 'send_email'

export type PersonaPreset =
  | 'executive_analyst'
  | 'business_writer'
  | 'operations_assistant'
  | 'custom'

export type RunStatus =
  | 'queued' | 'running' | 'success' | 'error' | 'cancelled'

export interface Agent {
  id:                 string
  group_id:           string
  name:               string
  description:        string | null
  avatar_color:       string
  model:              AgentModel
  persona_preset:     PersonaPreset
  persona:            string | null
  instructions:       string | null
  tools:              AgentTool[]
  company_scope:      string[] | null
  email_address:      string | null
  email_display_name: string | null
  email_recipients:   string[] | null
  slack_channel:      string | null
  is_active:          boolean
  created_at:         string
  updated_at:         string
}

export interface AgentCredential {
  id:           string
  agent_id:     string
  name:         string
  key:          string
  description:  string | null
  last_used_at: string | null
  expires_at:   string | null
  is_active:    boolean
  created_at:   string
  // value is NEVER returned to client
}

export interface ToolCallLog {
  tool:        string
  input:       Record<string, unknown>
  output:      string
  timestamp:   string
  duration_ms: number
}

export interface AgentRun {
  id:                string
  agent_id:          string
  group_id:          string
  triggered_by:      string
  triggered_by_user: string | null
  status:            RunStatus
  input_context: {
    period?:              string
    company_ids?:         string[]
    extra_instructions?:  string
  }
  output:           string | null
  output_type:      string
  tool_calls:       ToolCallLog[]
  model_used:       string | null
  tokens_used:      number | null
  error_message:    string | null
  draft_report_id:  string | null
  started_at:       string | null
  completed_at:     string | null
  created_at:       string
}

export const PERSONA_PRESETS: Record<PersonaPreset, string> = {
  executive_analyst:
    'You communicate in a formal, concise tone suited for executive audiences. ' +
    'Lead with key numbers and insights. Structure responses with an executive ' +
    'summary first, detail second. Flag risks clearly without being alarmist. Be direct.',
  business_writer:
    'You write in clear, engaging prose with a professional but approachable tone. ' +
    'Use narrative structure to tell the story behind the numbers. Avoid jargon. ' +
    'Make complex financial information accessible to non-finance readers.',
  operations_assistant:
    'You are practical and action-oriented. Use bullet points and checklists. ' +
    'Prioritise next steps and actionable recommendations. Keep responses concise. ' +
    'Flag blockers and dependencies clearly.',
  custom: '',
}

export const MODEL_OPTIONS: Array<{
  value:       AgentModel
  label:       string
  description: string
  tier:        'standard' | 'advanced' | 'external'
}> = [
  {
    value:       'claude-sonnet-4-20250514',
    label:       'Claude Sonnet 4',
    description: 'Fast and cost-effective. Best for routine tasks.',
    tier:        'standard',
  },
  {
    value:       'claude-opus-4-20250514',
    label:       'Claude Opus 4',
    description: 'Most capable. Best for complex analysis.',
    tier:        'advanced',
  },
  {
    value:       'gpt-4o',
    label:       'GPT-4o',
    description: 'OpenAI model. Requires OPENAI_API_KEY credential.',
    tier:        'external',
  },
]

// ============================================================
// API response types
// ============================================================

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
}
