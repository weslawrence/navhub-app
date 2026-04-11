/**
 * Agent Tool Implementations
 * SERVER-SIDE ONLY — never import in client components.
 *
 * Each exported function corresponds to a tool that agents can invoke.
 * Functions receive already-validated parameters and return a formatted string.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getSummaryValue } from '@/lib/financial'
import { renderTemplate, validateSlots } from '@/lib/template-renderer'
import { buildForecastGrid, get13Weeks, formatWeekHeader } from '@/lib/cashflow'
import type { FinancialData, Agent, ReportTemplate, SlotDefinition, DocumentType, DocumentAudience, CashflowItem, CashflowSettings, CashflowXeroItem, MarketingPlatform } from '@/lib/types'
import { MARKETING_PLATFORM_LABELS, MARKETING_METRICS } from '@/lib/types'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ReadFinancialsParams {
  company_ids:  string[]   // empty = all in scope
  periods:      string[]   // YYYY-MM
  report_types: ('profit_loss' | 'balance_sheet')[]
}

export interface ReadCompaniesParams {
  include_divisions?: boolean
}

export interface GenerateReportParams {
  title:        string
  content:      string   // markdown
  description?: string
  template_id?: string
  slot_data?:   Record<string, unknown>
}

export interface ListReportTemplatesParams {
  template_type?: 'financial' | 'matrix' | 'narrative' | 'dashboard' | 'workflow'
}

export interface ReadReportTemplateParams {
  template_id:       string
  include_scaffold?: boolean
}

export interface CreateReportTemplateParams {
  name:               string
  template_type:      'financial' | 'matrix' | 'narrative' | 'dashboard' | 'workflow'
  description?:       string
  design_tokens?:     Record<string, string>
  slots:              SlotDefinition[]
  scaffold_html?:     string
  scaffold_css?:      string
  scaffold_js?:       string
  agent_instructions?: string
}

export interface UpdateReportTemplateParams {
  template_id: string
  changes:     Partial<{
    name:               string
    description:        string
    design_tokens:      Record<string, string>
    slots:              SlotDefinition[]
    scaffold_html:      string
    scaffold_css:       string
    scaffold_js:        string
    agent_instructions: string
  }>
}

export interface RenderReportParams {
  template_id:  string
  slot_data:    Record<string, unknown>
  report_name:  string
  notes?:       string
}

export interface AnalyseDocumentParams {
  file_url?:    string
  file_content?: string
  instructions?: string
}

export interface ReadAttachmentParams {
  file_name: string
}

export interface ReadMarketingDataParams {
  company_id?:  string        // optional — if omitted, returns group-level rollup
  platforms?:   MarketingPlatform[]  // optional filter
  period?:      string        // YYYY-MM; defaults to latest available
  num_periods?: number        // how many past periods to include (1–12); default 3
}

export interface SummariseMarketingParams {
  company_id: string          // required — summarise one company at a time
  period?:    string          // YYYY-MM; defaults to latest available
}

export interface SendSlackParams {
  message:   string
  channel?:  string
}

export interface SendEmailParams {
  to:                string[]
  subject:           string
  body:              string   // markdown → converted to HTML
  attach_report_id?: string
}

export interface ToolContext {
  agent:       Agent
  groupId:     string
  groupName:   string
  runId:       string
  credentials: Record<string, string>
}

// ────────────────────────────────────────────────────────────────────────────
// read_financials
// ────────────────────────────────────────────────────────────────────────────

export async function readFinancials(
  params:  ReadFinancialsParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Resolve company_ids: empty = all in scope
  let companyIds: string[] = params.company_ids
  if (!companyIds || companyIds.length === 0) {
    const { data: companies } = await admin
      .from('companies')
      .select('id, name')
      .eq('group_id', context.groupId)
      .eq('is_active', true)
    companyIds = (companies ?? []).map((c: { id: string }) => c.id)
  }

  if (companyIds.length === 0) {
    return 'No companies found in scope.'
  }

  const results: string[] = []

  for (const period of params.periods) {
    for (const reportType of params.report_types) {
      // Prefer division snapshots, fall back to company-level
      const { data: snapshots } = await admin
        .from('financial_snapshots')
        .select('company_id, division_id, data')
        .in('company_id', companyIds)
        .eq('period', period)
        .eq('report_type', reportType)

      if (!snapshots || snapshots.length === 0) {
        results.push(`[${period}] [${reportType}] — No data available`)
        continue
      }

      const label = reportType === 'profit_loss' ? 'Profit & Loss' : 'Balance Sheet'
      results.push(`\n### ${label} — ${period}`)

      for (const snap of snapshots) {
        const data = snap.data as FinancialData
        if (!data) continue

        const currency = data.currency ?? 'AUD'
        const formatCents = (c: number | null) =>
          c === null ? 'N/A' : `${currency} ${(c / 100).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`

        if (reportType === 'profit_loss') {
          const revenue   = getSummaryValue(data, 'Total Operating Revenue') ?? getSummaryValue(data, 'Total Revenue') ?? getSummaryValue(data, 'Revenue')
          const grossProfit = getSummaryValue(data, 'Gross Profit')
          const netProfit = getSummaryValue(data, 'Net Profit') ?? getSummaryValue(data, 'Net Profit Before Tax')
          const opEx      = getSummaryValue(data, 'Total Operating Expenses') ?? getSummaryValue(data, 'Operating Expenses')

          results.push(
            `  Entity: ${snap.division_id ? `Division ${snap.division_id}` : `Company ${snap.company_id}`}`,
            `  Revenue:           ${formatCents(revenue)}`,
            `  Gross Profit:      ${formatCents(grossProfit)}`,
            `  Operating Expenses: ${formatCents(opEx)}`,
            `  Net Profit:        ${formatCents(netProfit)}`,
          )
        } else {
          // Balance sheet
          const totalAssets   = getSummaryValue(data, 'Total Assets')
          const totalLiab     = getSummaryValue(data, 'Total Liabilities')
          const netAssets     = getSummaryValue(data, 'Net Assets') ?? getSummaryValue(data, 'Total Equity')
          const cash          = getSummaryValue(data, 'Cash and Cash Equivalents') ?? getSummaryValue(data, 'Cash')

          results.push(
            `  Entity: ${snap.division_id ? `Division ${snap.division_id}` : `Company ${snap.company_id}`}`,
            `  Total Assets:      ${formatCents(totalAssets)}`,
            `  Total Liabilities: ${formatCents(totalLiab)}`,
            `  Net Assets:        ${formatCents(netAssets)}`,
            `  Cash:              ${formatCents(cash)}`,
          )
        }
      }
    }
  }

  return results.join('\n') || 'No financial data found for the requested criteria.'
}

// ────────────────────────────────────────────────────────────────────────────
// read_companies
// ────────────────────────────────────────────────────────────────────────────

export async function readCompanies(
  params:  ReadCompaniesParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Return id + name only for token efficiency; agent can call read_financials for detailed data
  const { data: companies } = await admin
    .from('companies')
    .select('id, name')
    .eq('group_id', context.groupId)
    .eq('is_active', true)
    .order('name')

  if (!companies || companies.length === 0) {
    return 'No companies found for this group.'
  }

  const lines: string[] = [`Companies in ${context.groupName}:\n`]

  for (const company of companies as Array<{ id: string; name: string }>) {
    lines.push(`• ${company.name} (id: ${company.id})`)

    if (params.include_divisions) {
      const { data: divs } = await admin
        .from('divisions')
        .select('id, name')
        .eq('company_id', company.id)
        .eq('is_active', true)
        .order('name')

      for (const div of (divs ?? []) as Array<{ id: string; name: string }>) {
        lines.push(`  └ ${div.name} (id: ${div.id})`)
      }
    }
  }

  return lines.join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// generate_report
// ────────────────────────────────────────────────────────────────────────────

export async function generateReport(
  params:  GenerateReportParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Parameter validation
  if (!params.title || typeof params.title !== 'string') {
    return JSON.stringify({
      success: false,
      error: 'report_name (title) is required.',
    })
  }

  let html: string
  let usedTemplateType: string | null = null

  // If template_id + slot_data provided, render via template system
  if (params.template_id && params.slot_data) {
    const { data: tmpl } = await admin
      .from('report_templates')
      .select('*')
      .eq('id', params.template_id)
      .eq('group_id', context.groupId)
      .single()

    if (!tmpl) return `Error: Template ${params.template_id} not found`

    usedTemplateType = (tmpl.template_type as string) ?? null

    const validation = validateSlots(tmpl.slots as SlotDefinition[], params.slot_data)
    if (!validation.valid) {
      return `Error: Missing required slots: ${validation.missing.join(', ')}`
    }

    html = renderTemplate(tmpl as ReportTemplate, params.slot_data)
  } else {
    // Convert markdown to styled HTML
    html = buildReportHtml(params.title, params.content)
  }

  // Save to Supabase Storage
  const timestamp   = Date.now()
  const safeName    = (params.title ?? 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
  const storagePath = `${context.groupId}/reports/${timestamp}_${safeName}.html`

  const { error: uploadErr } = await admin.storage
    .from('report-files')
    .upload(storagePath, Buffer.from(html, 'utf-8'), { contentType: 'text/html' })

  if (uploadErr) {
    return `Error saving report: ${uploadErr.message}`
  }

  // Insert record as draft
  const { data: report, error: dbErr } = await admin
    .from('custom_reports')
    .insert({
      group_id:      context.groupId,
      name:          params.title,
      description:   params.description ?? null,
      file_path:     storagePath,
      file_type:     'html',
      uploaded_by:   null,
      is_draft:      true,
      draft_notes:   `Generated by agent "${context.agent.name}"`,
      agent_run_id:  context.runId,
      template_id:   params.template_id ?? null,
      slot_data:     params.slot_data ?? null,
    })
    .select('id, name')
    .single()

  if (dbErr || !report) {
    // Clean up storage
    await admin.storage.from('report-files').remove([storagePath])
    return `Error saving report record: ${dbErr?.message ?? 'Unknown error'}`
  }

  // Auto-generate tags from template type + report name words
  const stopWords = ['the','a','an','and','or','for','of','in','to','v1','v2','v3','v4','v5']
  const autoTags: string[] = []
  if (usedTemplateType) autoTags.push(usedTemplateType)
  const nameWords = (params.title ?? 'report')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.includes(w))
    .slice(0, 3)
  autoTags.push(...nameWords)
  const tags = autoTags.filter((v, i, a) => a.indexOf(v) === i)
  void admin.from('custom_reports').update({ tags }).eq('id', report.id)

  return JSON.stringify({
    report_id: report.id,
    url:       `/reports/custom/${report.id}`,
    name:      report.name,
  })
}

function buildReportHtml(title: string, markdown: string): string {
  // Convert markdown to HTML (basic implementation — headings, bold, lists, tables, paragraphs)
  const body = markdown
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr>')
    // Unordered lists
    .replace(/^[•\-] (.+)$/gm, '<li>$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    // Tables (basic)
    .replace(/\|(.+)\|/g, (line) => {
      if (line.match(/^\|[-| ]+\|$/)) return ''
      const cells = line.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`)
      return `<tr>${cells.join('')}</tr>`
    })
    // Paragraphs (double newline)
    .split('\n\n')
    .map(p => {
      const t = p.trim()
      if (!t || t.startsWith('<')) return t
      return `<p>${t.replace(/\n/g, '<br>')}</p>`
    })
    .join('\n')

  const now = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #0a0d13;
    color: #e2e8f0;
    line-height: 1.7;
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }
  header { border-bottom: 2px solid #6366f1; padding-bottom: 1.5rem; margin-bottom: 2rem; }
  header h1 { font-size: 1.75rem; font-weight: 700; color: #f1f5f9; }
  header .meta { color: #64748b; font-size: 0.875rem; margin-top: 0.5rem; }
  h1 { font-size: 1.5rem; font-weight: 700; color: #f1f5f9; margin: 1.5rem 0 0.75rem; }
  h2 { font-size: 1.25rem; font-weight: 600; color: #cbd5e1; margin: 1.25rem 0 0.5rem; }
  h3 { font-size: 1rem; font-weight: 600; color: #94a3b8; margin: 1rem 0 0.5rem; }
  p { margin: 0.75rem 0; }
  strong { color: #f1f5f9; font-weight: 600; }
  ul, ol { padding-left: 1.5rem; margin: 0.75rem 0; }
  li { margin: 0.25rem 0; }
  hr { border: none; border-top: 1px solid #1e293b; margin: 1.5rem 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    font-size: 0.875rem;
  }
  th {
    background: #1e293b;
    color: #94a3b8;
    padding: 0.5rem 0.75rem;
    text-align: left;
    font-weight: 600;
    border-bottom: 1px solid #334155;
  }
  td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #1e293b;
  }
  tr:nth-child(even) td { background: #0f172a; }
  tr:hover td { background: #1e293b; }
  .accent { color: #6366f1; }
  footer {
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 1px solid #1e293b;
    font-size: 0.75rem;
    color: #475569;
  }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Generated ${now} · NavHub AI Agent</div>
</header>
<main>
${body}
</main>
<footer>
  This report was automatically generated by NavHub. Review before distribution.
</footer>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ────────────────────────────────────────────────────────────────────────────
// send_slack
// ────────────────────────────────────────────────────────────────────────────

export async function sendSlack(
  params:  SendSlackParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  const { data: group } = await admin
    .from('groups')
    .select('slack_webhook_url, slack_default_channel')
    .eq('id', context.groupId)
    .single()

  if (!group?.slack_webhook_url) {
    return 'Error: Slack not configured for this group. Add a Slack webhook URL in group settings.'
  }

  const channel  = params.channel ?? context.agent.slack_channel ?? group.slack_default_channel ?? undefined
  const payload: Record<string, unknown> = {
    text: `*${context.agent.name}*\n${params.message}`,
  }
  if (channel) payload.channel = channel

  const res = await fetch(group.slack_webhook_url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    return `Error sending Slack message: ${res.status} ${text}`
  }

  return 'sent'
}

// ────────────────────────────────────────────────────────────────────────────
// send_email
// ────────────────────────────────────────────────────────────────────────────

export async function sendEmail(
  params:  SendEmailParams,
  context: ToolContext
): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return 'Error: RESEND_API_KEY environment variable not set.'
  }

  const fromDomain = process.env.RESEND_FROM_DOMAIN ?? 'navhub.co'
  const admin      = createAdminClient()

  // Determine from address
  let fromEmail: string
  if (context.agent.email_address) {
    // Check if group has custom domain verified
    const { data: group } = await admin
      .from('groups')
      .select('custom_email_domain, custom_email_verified')
      .eq('id', context.groupId)
      .single()

    const domain = (group?.custom_email_verified && group?.custom_email_domain)
      ? group.custom_email_domain
      : fromDomain

    fromEmail = `${context.agent.email_address}@${domain}`
  } else {
    fromEmail = `agents@${fromDomain}`
  }

  const fromName = context.agent.email_display_name ?? context.agent.name

  // Convert markdown body to simple HTML
  const htmlBody = simpleMarkdownToHtml(params.body)

  // If attach_report_id, generate a signed URL link
  let attachmentSection = ''
  if (params.attach_report_id) {
    const { data: signed } = await admin.storage
      .from('report-files')
      .createSignedUrl(params.attach_report_id, 3600)

    if (signed?.signedUrl) {
      attachmentSection = `
        <p style="margin-top:24px;">
          <a href="${signed.signedUrl}" style="color:#6366f1;font-weight:600;">
            📄 View attached report (link expires in 1 hour)
          </a>
        </p>`
    }
  }

  const payload = {
    from:    `${fromName} <${fromEmail}>`,
    to:      params.to,
    subject: params.subject,
    html:    `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:24px;">${htmlBody}${attachmentSection}<hr style="margin-top:32px;border-color:#e2e8f0;"><p style="font-size:12px;color:#94a3b8;">Sent by ${fromName} via NavHub</p></body></html>`,
  }

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const json = await res.json().catch(() => ({})) as { message?: string }
    return `Error sending email: ${res.status} ${json.message ?? 'Unknown error'}`
  }

  return `sent to ${params.to.join(', ')}`
}

function simpleMarkdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 style="font-size:16px;font-weight:600;margin:16px 0 8px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:20px;font-weight:600;margin:20px 0 10px;">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:24px;font-weight:700;margin:24px 0 12px;">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^[•\-] (.+)$/gm, '<li style="margin:4px 0;">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) => `<ul style="padding-left:20px;margin:8px 0;">${m}</ul>`)
    .split('\n\n')
    .map(p => {
      const t = p.trim()
      if (!t || t.startsWith('<')) return t
      return `<p style="margin:12px 0;">${t.replace(/\n/g, '<br>')}</p>`
    })
    .join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// list_report_templates
// ────────────────────────────────────────────────────────────────────────────

export async function listReportTemplates(
  params:  ListReportTemplatesParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Return id + name + type only; agent calls read_report_template for full detail
  let query = admin
    .from('report_templates')
    .select('id, name, template_type')
    .eq('group_id', context.groupId)
    .eq('is_active', true)
    .order('name')

  if (params.template_type) {
    query = query.eq('template_type', params.template_type)
  }

  const { data, error } = await query

  if (error) return `Error fetching templates: ${error.message}`
  if (!data || data.length === 0) return 'No report templates found for this group.'

  const templateLines = (data as { id: string; name: string; template_type: string }[])
    .map((t, i) => `${i + 1}. template_id="${t.id}" name="${t.name}" type="${t.template_type}"`)
    .join('\n')

  return `Found ${data.length} template(s):\n${templateLines}\n\nTo read a template, call read_report_template with the template_id value shown above (the UUID in quotes).`
}

// ────────────────────────────────────────────────────────────────────────────
// read_report_template
// ────────────────────────────────────────────────────────────────────────────

export async function readReportTemplate(
  params:  ReadReportTemplateParams,
  context: ToolContext
): Promise<string> {
  // Guard: template_id must be a real UUID, not the literal string "undefined"
  if (!params.template_id || params.template_id === 'undefined' || params.template_id.trim() === '') {
    return JSON.stringify({
      success: false,
      error:   'template_id is required. Call list_report_templates first to get a template_id, then pass that value here.',
    })
  }

  const admin = createAdminClient()

  // Always fetch scaffold fields so we can compute scaffold_size,
  // but omit the actual scaffold content unless explicitly requested.
  const { data, error } = await admin
    .from('report_templates')
    .select('id, name, template_type, description, version, design_tokens, slots, data_sources, agent_instructions, scaffold_html, scaffold_css, scaffold_js, created_at, updated_at')
    .eq('id', params.template_id)
    .eq('group_id', context.groupId)
    .eq('is_active', true)
    .single()

  if (error || !data) return `Error: Template ${params.template_id} not found`

  const d = data as {
    scaffold_html: string | null
    scaffold_css:  string | null
    scaffold_js:   string | null
    [key: string]: unknown
  }

  if (!params.include_scaffold) {
    // Compute approximate scaffold size and strip scaffold content from response
    const scaffoldSize =
      (d.scaffold_html?.length ?? 0) +
      (d.scaffold_css?.length  ?? 0) +
      (d.scaffold_js?.length   ?? 0)

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { scaffold_html, scaffold_css, scaffold_js, ...rest } = d

    return JSON.stringify({
      success: true,
      data: { ...rest, scaffold_size: scaffoldSize },
    })
  }

  return JSON.stringify({ success: true, data })
}

// ────────────────────────────────────────────────────────────────────────────
// create_report_template
// ────────────────────────────────────────────────────────────────────────────

export async function createReportTemplate(
  params:  CreateReportTemplateParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('report_templates')
    .insert({
      group_id:           context.groupId,
      name:               params.name,
      template_type:      params.template_type,
      description:        params.description ?? null,
      design_tokens:      params.design_tokens ?? {},
      slots:              params.slots ?? [],
      scaffold_html:      params.scaffold_html ?? null,
      scaffold_css:       params.scaffold_css ?? null,
      scaffold_js:        params.scaffold_js ?? null,
      agent_instructions: params.agent_instructions ?? null,
      agent_run_id:       context.runId,
      created_by:         null,
      version:            1,
      is_active:          true,
    })
    .select('id, name, template_type, version')
    .single()

  if (error || !data) return `Error creating template: ${error?.message ?? 'Unknown error'}`

  return JSON.stringify({ success: true, data })
}

// ────────────────────────────────────────────────────────────────────────────
// update_report_template
// ────────────────────────────────────────────────────────────────────────────

export async function updateReportTemplate(
  params:  UpdateReportTemplateParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Verify ownership
  const { data: current } = await admin
    .from('report_templates')
    .select('id, group_id, version, design_tokens, slots, scaffold_html, scaffold_css, scaffold_js')
    .eq('id', params.template_id)
    .eq('group_id', context.groupId)
    .eq('is_active', true)
    .single()

  if (!current) return `Error: Template ${params.template_id} not found`

  // Save current to versions before updating
  void admin.from('report_template_versions').insert({
    template_id:   params.template_id,
    version:       current.version,
    design_tokens: current.design_tokens,
    slots:         current.slots,
    scaffold_html: current.scaffold_html,
    scaffold_css:  current.scaffold_css,
    scaffold_js:   current.scaffold_js,
    saved_by:      null,
  })

  const allowedFields = [
    'name', 'description', 'design_tokens', 'slots',
    'scaffold_html', 'scaffold_css', 'scaffold_js', 'agent_instructions',
  ]
  const updates: Record<string, unknown> = {
    version:    current.version + 1,
    updated_at: new Date().toISOString(),
  }
  for (const key of allowedFields) {
    if (key in params.changes) {
      updates[key] = params.changes[key as keyof typeof params.changes]
    }
  }

  const { data, error } = await admin
    .from('report_templates')
    .update(updates)
    .eq('id', params.template_id)
    .select('id, name, version')
    .single()

  if (error) return `Error updating template: ${error.message}`

  return JSON.stringify({ success: true, data })
}

// ────────────────────────────────────────────────────────────────────────────
// render_report
// ────────────────────────────────────────────────────────────────────────────

export async function renderReport(
  params:  RenderReportParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Parameter validation
  if (!params.template_id || params.template_id === 'undefined') {
    return JSON.stringify({
      success: false,
      error: 'template_id is required. Call list_report_templates first to get the template_id, then pass it here.',
    })
  }
  if (!params.report_name || typeof params.report_name !== 'string' || params.report_name.trim() === '') {
    return JSON.stringify({
      success: false,
      error: 'report_name is required and must be a non-empty string.',
    })
  }
  if (!params.slot_data || typeof params.slot_data !== 'object') {
    return JSON.stringify({
      success: false,
      error: 'slot_data is required and must be an object mapping slot names to values.',
    })
  }

  // Fetch template
  const { data: tmpl } = await admin
    .from('report_templates')
    .select('*')
    .eq('id', params.template_id)
    .eq('group_id', context.groupId)
    .eq('is_active', true)
    .single()

  if (!tmpl) return `Error: Template ${params.template_id} not found`

  // Validate slots
  const validation = validateSlots(tmpl.slots as SlotDefinition[], params.slot_data)
  if (!validation.valid) {
    return `Error: Missing required slots: ${validation.missing.join(', ')}`
  }

  // Render to HTML
  const html = renderTemplate(tmpl as ReportTemplate, params.slot_data)

  // Save to Storage
  const timestamp   = Date.now()
  const safeName    = (params.report_name ?? 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
  const storagePath = `${context.groupId}/reports/${timestamp}_${safeName}.html`

  const { error: uploadErr } = await admin.storage
    .from('report-files')
    .upload(storagePath, Buffer.from(html, 'utf-8'), { contentType: 'text/html' })

  if (uploadErr) return `Error saving report: ${uploadErr.message}`

  // Insert custom_reports record
  const { data: report, error: dbErr } = await admin
    .from('custom_reports')
    .insert({
      group_id:     context.groupId,
      name:         params.report_name,
      description:  params.notes ?? null,
      file_path:    storagePath,
      file_type:    'html',
      uploaded_by:  'agent',
      is_draft:     false,
      agent_run_id: context.runId,
      template_id:  params.template_id,
      slot_data:    params.slot_data,
    })
    .select('id, name')
    .single()

  if (dbErr || !report) {
    await admin.storage.from('report-files').remove([storagePath])
    return `Error saving report record: ${dbErr?.message ?? 'Unknown error'}`
  }

  // Auto-generate tags from template type + report name words
  const stopWordsR = ['the','a','an','and','or','for','of','in','to','v1','v2','v3','v4','v5']
  const autoTagsR: string[] = [(tmpl as ReportTemplate).template_type as string]
  const nameWordsR = (params.report_name ?? 'report')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w: string) => w.length > 3 && !stopWordsR.includes(w))
    .slice(0, 3)
  autoTagsR.push(...nameWordsR)
  const tagsR = autoTagsR.filter((v, i, a) => a.indexOf(v) === i)
  void admin.from('custom_reports').update({ tags: tagsR }).eq('id', report.id)

  return JSON.stringify({
    success:     true,
    report_id:   report.id,
    report_name: report.name,
    view_url:    `/reports/custom/${report.id}`,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// analyse_document
// ────────────────────────────────────────────────────────────────────────────

export async function analyseDocument(
  params:  AnalyseDocumentParams,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return 'Error: ANTHROPIC_API_KEY environment variable not set.'

  let content = params.file_content ?? ''

  // If file_url provided, fetch from Storage
  if (params.file_url && !content) {
    try {
      const admin = createAdminClient()
      // Extract path from URL or use as-is (support both full URL and storage path)
      const res = await fetch(params.file_url)
      if (res.ok) {
        content = await res.text()
        // Truncate very large files to avoid context limits
        if (content.length > 50000) content = content.slice(0, 50000) + '\n\n[content truncated]'
      } else {
        // Try as storage path
        const { data: signed } = await admin.storage
          .from('report-files')
          .createSignedUrl(params.file_url, 60)
        if (signed?.signedUrl) {
          const fileRes = await fetch(signed.signedUrl)
          if (fileRes.ok) content = await fileRes.text()
        }
      }
    } catch (e) {
      return `Error fetching file: ${e instanceof Error ? e.message : 'Unknown error'}`
    }
  }

  if (!content) return 'Error: No document content provided. Pass file_url or file_content.'

  const systemPrompt = `You are a template extraction specialist. Analyse the provided document and extract a structured report template definition.

Return ONLY a valid JSON object with this exact structure:
{
  "name": "string — short template name",
  "template_type": "financial|matrix|narrative|dashboard|workflow",
  "description": "string — what this template is for",
  "design_tokens": { "css-var-name": "value" },
  "slots": [
    {
      "name": "snake_case_name",
      "label": "Human Label",
      "type": "text|html|number|table|list|date|color|object",
      "description": "what goes in this slot",
      "required": true,
      "data_source": "manual|navhub_financial|agent_provided|uploaded_file"
    }
  ],
  "agent_instructions": "string — instructions for agents filling this template",
  "confidence": "high|medium|low",
  "notes": "string — anything the user should know about the extraction"
}

Do NOT save to database. Return the parsed JSON proposal only.`

  const userMessage = [
    params.instructions ? `Instructions: ${params.instructions}\n\n` : '',
    `Document content:\n\n${content}`,
  ].join('')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-20250514',
      max_tokens: 4096,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    return `Error calling Anthropic API: ${res.status} ${err.error?.message ?? 'Unknown'}`
  }

  const json = await res.json() as { content?: Array<{ type: string; text?: string }> }
  const textBlock = json.content?.find(b => b.type === 'text')
  const text = textBlock?.text ?? ''

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return `Error: Could not extract JSON from model response. Raw response: ${text.slice(0, 500)}`

  try {
    const proposal = JSON.parse(jsonMatch[0])
    return JSON.stringify({ success: true, proposal })
  } catch {
    return `Error: Invalid JSON in model response: ${text.slice(0, 500)}`
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Document tool parameter types  (Phase 7b)
// ────────────────────────────────────────────────────────────────────────────

export interface ListDocumentsParams {
  document_type?: string
  company_id?:    string
  folder_id?:     string
}

export interface ReadDocumentParams {
  document_id: string
}

export interface CreateDocumentParams {
  title:            string
  document_type:    DocumentType
  audience:         DocumentAudience
  content_markdown: string
  company_id?:      string
  folder_id?:       string
  notes?:           string
}

export interface UpdateDocumentParams {
  document_id:       string
  content_markdown:  string
  title?:            string
  reason?:           string
}

// ────────────────────────────────────────────────────────────────────────────
// list_documents
// ────────────────────────────────────────────────────────────────────────────

export async function listDocuments(
  params:  ListDocumentsParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  let query = admin
    .from('documents')
    .select('id, title, document_type, audience, status, company_id, created_at, updated_at')
    .eq('group_id', context.groupId)
    .order('updated_at', { ascending: false })

  if (params.document_type) query = query.eq('document_type', params.document_type)
  if (params.company_id)    query = query.eq('company_id', params.company_id)
  if (params.folder_id)     query = query.eq('folder_id', params.folder_id)

  const { data, error } = await query
  if (error) return `Error listing documents: ${error.message}`
  if (!data || data.length === 0) return 'No documents found matching the criteria.'

  return JSON.stringify({
    success: true,
    data:    data.map((d: Record<string, unknown>) => ({
      id:            d.id,
      title:         d.title,
      document_type: d.document_type,
      audience:      d.audience,
      status:        d.status,
      company_id:    d.company_id,
      created_at:    d.created_at,
      updated_at:    d.updated_at,
    })),
    count: data.length,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// read_document
// ────────────────────────────────────────────────────────────────────────────

export async function readDocument(
  params:  ReadDocumentParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('documents')
    .select('id, title, document_type, audience, content_markdown, status, company_id, updated_at')
    .eq('id', params.document_id)
    .eq('group_id', context.groupId)
    .single()

  if (error || !data) return `Error: Document ${params.document_id} not found or not accessible.`

  return JSON.stringify({ success: true, data })
}

// ────────────────────────────────────────────────────────────────────────────
// create_document
// ────────────────────────────────────────────────────────────────────────────

export async function createDocument(
  params:  CreateDocumentParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  const { data, error } = await admin.from('documents').insert({
    group_id:         context.groupId,
    title:            params.title,
    document_type:    params.document_type,
    audience:         params.audience,
    content_markdown: params.content_markdown,
    company_id:       params.company_id ?? null,
    folder_id:        params.folder_id  ?? null,
    status:           'published',
    agent_run_id:     context.runId,
    created_by:       null,
  }).select('id, title, document_type, audience').single()

  if (error) return `Error creating document: ${error.message}`

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const viewUrl = `${appUrl}/documents/${(data as { id: string }).id}`

  return JSON.stringify({
    success:     true,
    data: {
      document_id:   (data as { id: string }).id,
      title:         params.title,
      document_type: params.document_type,
      audience:      params.audience,
      view_url:      viewUrl,
    },
  })
}

// ────────────────────────────────────────────────────────────────────────────
// update_document
// ────────────────────────────────────────────────────────────────────────────

export async function updateDocument(
  params:  UpdateDocumentParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Verify ownership
  const { data: existing } = await admin
    .from('documents')
    .select('id, title, content_markdown')
    .eq('id', params.document_id)
    .eq('group_id', context.groupId)
    .single()

  if (!existing) return `Error: Document ${params.document_id} not found or not accessible.`

  // Auto-version current content
  const { count } = await admin
    .from('document_versions')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', params.document_id)

  void admin.from('document_versions').insert({
    document_id:      params.document_id,
    content_markdown: (existing as { content_markdown: string }).content_markdown,
    version:          (count ?? 0) + 1,
    created_by:       null,
  })

  // Apply update
  const updates: Record<string, unknown> = {
    content_markdown: params.content_markdown,
    updated_at:       new Date().toISOString(),
  }
  if (params.title) updates.title = params.title

  const { error } = await admin
    .from('documents')
    .update(updates)
    .eq('id', params.document_id)

  if (error) return `Error updating document: ${error.message}`

  return JSON.stringify({
    success: true,
    data: {
      document_id: params.document_id,
      title:       params.title ?? (existing as { title: string }).title,
      reason:      params.reason ?? 'Updated by agent',
    },
  })
}

// ============================================================
// Phase 4c — Cash Flow Tools
// ============================================================

export interface ReadCashflowParams {
  company_id: string
}

export interface ReadCashflowItemsParams {
  company_id: string
  section?:   'inflow' | 'regular_outflow' | 'payable'
}

export interface SuggestCashflowItemParams {
  company_id:   string
  label:        string
  section:      'inflow' | 'regular_outflow' | 'payable'
  amount_cents: number
  recurrence:   'weekly' | 'fortnightly' | 'monthly' | 'one_off'
  start_date:   string
  end_date?:    string
  day_of_week?:  number
  day_of_month?: number
  reason?:      string
}

export interface UpdateCashflowItemParams {
  company_id:    string
  item_id:       string
  pending_review?: boolean
  label?:        string
  amount_cents?: number
  is_active?:    boolean
}

export interface CreateCashflowSnapshotParams {
  company_id: string
  name:       string
  notes?:     string
}

export interface SummariseCashflowParams {
  company_id: string
}

/** Read the current 13-week forecast grid summary for a company */
export async function readCashflow(
  params:  ReadCashflowParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Verify ownership
  const { data: co } = await admin
    .from('companies')
    .select('id, name')
    .eq('id', params.company_id)
    .eq('group_id', context.groupId)
    .single()
  if (!co) return `Error: Company ${params.company_id} not found in group.`

  // Load settings, items, xero items
  const [settingsRes, itemsRes, xeroRes] = await Promise.all([
    admin.from('cashflow_settings').select('*').eq('company_id', params.company_id).maybeSingle(),
    admin.from('cashflow_items').select('*').eq('company_id', params.company_id).eq('is_active', true),
    admin.from('cashflow_xero_items').select('*').eq('company_id', params.company_id).neq('sync_status', 'excluded'),
  ])

  const settings: CashflowSettings = settingsRes.data ?? {
    company_id: params.company_id, opening_balance_cents: 0,
    week_start_day: 1, ar_lag_days: 30, ap_lag_days: 30, currency: 'AUD',
    updated_at: new Date().toISOString(),
  }

  const weeks = get13Weeks(settings.week_start_day)
  const grid  = buildForecastGrid({
    items:     (itemsRes.data ?? []) as CashflowItem[],
    settings,
    weeks,
    xeroItems: (xeroRes.data ?? []) as CashflowXeroItem[],
  })

  const currency = settings.currency ?? 'AUD'
  const fmt = (cents: number) => `${currency} ${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 0 })}`

  const lines: string[] = [
    `13-Week Cash Flow Forecast — ${(co as { name: string }).name}`,
    `Opening Balance: ${fmt(grid.summary.openingBalance[0] ?? 0)}`,
    '',
    'Week-by-week summary:',
    ...weeks.map((w, i) =>
      `  ${formatWeekHeader(w)}: Inflows ${fmt(grid.sections.inflows.subtotals[i])} | Outflows ${fmt(grid.sections.regularOutflows.subtotals[i])} | Payables ${fmt(grid.sections.payables.subtotals[i])} | Net ${fmt(grid.summary.netCashFlow[i])} | Closing ${fmt(grid.summary.closingBalance[i])}`
    ),
    '',
    `Min Closing Balance: ${fmt(Math.min(...grid.summary.closingBalance))}`,
    `Max Closing Balance: ${fmt(Math.max(...grid.summary.closingBalance))}`,
  ]

  const negativeWeeks = grid.summary.closingBalance.filter(b => b < 0).length
  if (negativeWeeks > 0) {
    lines.push(`⚠ ${negativeWeeks} week(s) with negative closing balance`)
  }

  return JSON.stringify({ success: true, data: { summary: lines.join('\n') } })
}

/** Read all cash flow line items for a company */
export async function readCashflowItems(
  params:  ReadCashflowItemsParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  const { data: co } = await admin
    .from('companies')
    .select('id, name')
    .eq('id', params.company_id)
    .eq('group_id', context.groupId)
    .single()
  if (!co) return `Error: Company ${params.company_id} not found in group.`

  let query = admin
    .from('cashflow_items')
    .select('id, label, section, amount_cents, recurrence, start_date, end_date, pending_review, is_active')
    .eq('company_id', params.company_id)
    .eq('is_active', true)
    .order('section')
    .order('created_at')

  if (params.section) query = query.eq('section', params.section)

  const { data: items, error } = await query
  if (error) return `Error: ${error.message}`

  return JSON.stringify({
    success: true,
    data: {
      company: (co as { name: string }).name,
      items:   (items ?? []).map(i => ({
        id:             i.id,
        label:          i.label,
        section:        i.section,
        amount_dollars: ((i.amount_cents as number) / 100).toFixed(2),
        recurrence:     i.recurrence,
        start_date:     i.start_date,
        end_date:       i.end_date ?? null,
        pending_review: i.pending_review,
      })),
    },
  })
}

/**
 * Suggest a new cash flow item (creates with pending_review = true so a human can review it).
 */
export async function suggestCashflowItem(
  params:  SuggestCashflowItemParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Verify ownership
  const { data: co } = await admin
    .from('companies')
    .select('id')
    .eq('id', params.company_id)
    .eq('group_id', context.groupId)
    .single()
  if (!co) return `Error: Company ${params.company_id} not found in group.`

  const { data: item, error } = await admin
    .from('cashflow_items')
    .insert({
      company_id:     params.company_id,
      label:          params.label,
      section:        params.section,
      amount_cents:   params.amount_cents,
      recurrence:     params.recurrence,
      start_date:     params.start_date,
      end_date:       params.end_date ?? null,
      day_of_week:    params.day_of_week ?? null,
      day_of_month:   params.day_of_month ?? null,
      pending_review: true,   // always flagged for human review
      is_active:      true,
    })
    .select('id, label, section, amount_cents')
    .single()

  if (error) return `Error creating item: ${error.message}`

  return JSON.stringify({
    success: true,
    data: {
      item_id:       (item as { id: string }).id,
      label:         params.label,
      section:       params.section,
      amount_dollars: (params.amount_cents / 100).toFixed(2),
      reason:        params.reason ?? 'Suggested by agent',
      note:          'Item created with pending_review = true — a human must approve it before it affects the forecast.',
    },
  })
}

/** Update an existing cash flow item (e.g. clear pending_review, toggle is_active, update amount). */
export async function updateCashflowItem(
  params:  UpdateCashflowItemParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Verify the item belongs to this group's company
  const { data: existing } = await admin
    .from('cashflow_items')
    .select('id, company_id, label')
    .eq('id', params.item_id)
    .single()

  if (!existing) return `Error: Item ${params.item_id} not found.`

  // Verify company belongs to this group
  const { data: co } = await admin
    .from('companies')
    .select('id')
    .eq('id', (existing as { company_id: string }).company_id)
    .eq('group_id', context.groupId)
    .single()
  if (!co) return `Error: Item does not belong to this group.`

  const updates: Record<string, unknown> = {}
  if (params.pending_review !== undefined) updates.pending_review = params.pending_review
  if (params.label          !== undefined) updates.label          = params.label
  if (params.amount_cents   !== undefined) updates.amount_cents   = params.amount_cents
  if (params.is_active      !== undefined) updates.is_active      = params.is_active

  const { error } = await admin
    .from('cashflow_items')
    .update(updates)
    .eq('id', params.item_id)

  if (error) return `Error updating item: ${error.message}`

  return JSON.stringify({
    success: true,
    data: {
      item_id: params.item_id,
      label:   params.label ?? (existing as { label: string }).label,
      updates,
    },
  })
}

/** Create a named cash flow snapshot of the current forecast. */
export async function createCashflowSnapshot(
  params:  CreateCashflowSnapshotParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Verify company
  const { data: co } = await admin
    .from('companies')
    .select('id, name')
    .eq('id', params.company_id)
    .eq('group_id', context.groupId)
    .single()
  if (!co) return `Error: Company ${params.company_id} not found.`

  // Build the grid
  const [settingsRes, itemsRes, xeroRes] = await Promise.all([
    admin.from('cashflow_settings').select('*').eq('company_id', params.company_id).maybeSingle(),
    admin.from('cashflow_items').select('*').eq('company_id', params.company_id).eq('is_active', true),
    admin.from('cashflow_xero_items').select('*').eq('company_id', params.company_id).neq('sync_status', 'excluded'),
  ])

  const settings: CashflowSettings = settingsRes.data ?? {
    company_id: params.company_id, opening_balance_cents: 0,
    week_start_day: 1, ar_lag_days: 30, ap_lag_days: 30, currency: 'AUD',
    updated_at: new Date().toISOString(),
  }

  const weeks    = get13Weeks(settings.week_start_day)
  const grid     = buildForecastGrid({
    items:     (itemsRes.data ?? []) as CashflowItem[],
    settings,
    weeks,
    xeroItems: (xeroRes.data ?? []) as CashflowXeroItem[],
  })

  const { data: snapshot, error } = await admin
    .from('cashflow_snapshots')
    .insert({
      company_id: params.company_id,
      name:       params.name,
      notes:      params.notes ?? `Created by agent run ${context.runId}`,
      grid_data:  grid,
      created_by: null,
    })
    .select('id, name')
    .single()

  if (error) return `Error creating snapshot: ${error.message}`

  return JSON.stringify({
    success: true,
    data: {
      snapshot_id:  (snapshot as { id: string }).id,
      name:         params.name,
      company:      (co as { name: string }).name,
      view_url:     `/cashflow/${params.company_id}/history`,
    },
  })
}

/**
 * Summarise the cash flow forecast using a secondary AI call (cash flow analyst persona).
 * Returns a concise executive summary with risks and recommendations.
 */
export async function summariseCashflow(
  params:  SummariseCashflowParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  const { data: co } = await admin
    .from('companies')
    .select('id, name')
    .eq('id', params.company_id)
    .eq('group_id', context.groupId)
    .single()
  if (!co) return `Error: Company ${params.company_id} not found.`

  // Build the raw forecast data
  const [settingsRes, itemsRes, xeroRes] = await Promise.all([
    admin.from('cashflow_settings').select('*').eq('company_id', params.company_id).maybeSingle(),
    admin.from('cashflow_items').select('*').eq('company_id', params.company_id).eq('is_active', true),
    admin.from('cashflow_xero_items').select('*').eq('company_id', params.company_id).neq('sync_status', 'excluded'),
  ])

  const settings: CashflowSettings = settingsRes.data ?? {
    company_id: params.company_id, opening_balance_cents: 0,
    week_start_day: 1, ar_lag_days: 30, ap_lag_days: 30, currency: 'AUD',
    updated_at: new Date().toISOString(),
  }

  const weeks = get13Weeks(settings.week_start_day)
  const grid  = buildForecastGrid({
    items:     (itemsRes.data ?? []) as CashflowItem[],
    settings,
    weeks,
    xeroItems: (xeroRes.data ?? []) as CashflowXeroItem[],
  })

  const currency = settings.currency ?? 'AUD'
  const fmt = (cents: number) => `${currency} ${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 0 })}`

  const forecastText = [
    `Company: ${(co as { name: string }).name}`,
    `Opening Balance: ${fmt(grid.summary.openingBalance[0] ?? 0)}`,
    '',
    weeks.map((w, i) =>
      `${formatWeekHeader(w)}: In=${fmt(grid.sections.inflows.subtotals[i])} Out=${fmt(grid.sections.regularOutflows.subtotals[i] + grid.sections.payables.subtotals[i])} Net=${fmt(grid.summary.netCashFlow[i])} Close=${fmt(grid.summary.closingBalance[i])}`
    ).join('\n'),
  ].join('\n')

  // Secondary Claude API call — cash flow analyst (raw fetch, same pattern as agent-runner.ts)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY not configured' })
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: `You are a cash flow analyst. Analyse the 13-week cash flow forecast and provide:
1. A brief executive summary (2–3 sentences)
2. Key risks (negative weeks, large swings, concentration of outflows)
3. 2–3 actionable recommendations
Be concise and direct. Format as plain text with clear headings.`,
        messages: [{ role: 'user', content: forecastText }],
      }),
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } }
      throw new Error(`Anthropic API error ${res.status}: ${errBody.error?.message ?? 'Unknown'}`)
    }

    const message = await res.json() as { content: { type: string; text?: string }[] }
    const summary = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('')

    return JSON.stringify({ success: true, data: { company: (co as { name: string }).name, summary } })
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: `Summarisation failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// read_marketing_data
// ────────────────────────────────────────────────────────────────────────────

export async function readMarketingData(
  params:  ReadMarketingDataParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Resolve which periods to fetch
  const numPeriods = Math.min(Math.max(params.num_periods ?? 3, 1), 12)

  // Build query
  let query = admin
    .from('marketing_snapshots')
    .select('platform, metric_key, value_number, period_start, company_id')
    .eq('group_id', context.groupId)
    .order('period_start', { ascending: false })
    .limit(numPeriods * 50)  // generous limit to cover all platforms × metrics × periods

  if (params.company_id) query = query.eq('company_id', params.company_id)
  if (params.platforms && params.platforms.length > 0) {
    query = query.in('platform', params.platforms)
  }
  if (params.period) {
    // Filter to period range: from (period - numPeriods months) to period
    const [y, m] = params.period.split('-').map(Number)
    const endDate   = new Date(y, m, 0).toISOString().slice(0, 10)      // last day of period
    const startYear = m - numPeriods <= 0 ? y - 1 : y
    const startMonth = ((m - numPeriods - 1 + 12) % 12) + 1
    const startDate = new Date(startYear, startMonth - 1, 1).toISOString().slice(0, 10)
    query = query.gte('period_start', startDate).lte('period_start', endDate)
  }

  const { data: snapshots, error } = await query
  if (error) return `Error fetching marketing data: ${error.message}`
  if (!snapshots || snapshots.length === 0) {
    return JSON.stringify({ success: true, data: [], message: 'No marketing data found for the specified criteria.' })
  }

  // Group by platform → period → metric
  const grouped: Record<string, Record<string, Record<string, number>>> = {}
  for (const snap of snapshots) {
    const platformKey = snap.platform as string
    const period      = (snap.period_start as string).slice(0, 7)  // YYYY-MM
    const metricKey   = snap.metric_key as string
    const value       = snap.value_number as number

    if (!grouped[platformKey]) grouped[platformKey] = {}
    if (!grouped[platformKey][period]) grouped[platformKey][period] = {}
    grouped[platformKey][period][metricKey] = value
  }

  // Format as structured text
  const lines: string[] = ['## Marketing Data Summary']
  const platformKeys = Object.keys(grouped) as MarketingPlatform[]

  for (const platform of platformKeys) {
    const platformLabel = MARKETING_PLATFORM_LABELS[platform] ?? platform
    lines.push(`\n### ${platformLabel}`)

    const periods = Object.keys(grouped[platform]).sort().reverse()
    const metrics = MARKETING_METRICS[platform] ?? []

    for (const period of periods) {
      lines.push(`**${period}**`)
      const periodData = grouped[platform][period]
      for (const metric of metrics) {
        const val = periodData[metric.key]
        if (val !== undefined) {
          const formatted = metric.type === 'percentage'
            ? `${val.toFixed(1)}%`
            : metric.type === 'currency'
              ? `$${val >= 1000 ? `${(val / 1000).toFixed(1)}K` : val.toFixed(0)}`
              : val >= 1000 ? `${(val / 1000).toFixed(1)}K` : String(val)
          lines.push(`  • ${metric.label}: ${formatted}`)
        }
      }
    }
  }

  return JSON.stringify({ success: true, data: grouped, summary: lines.join('\n') })
}

// ────────────────────────────────────────────────────────────────────────────
// summarise_marketing
// ────────────────────────────────────────────────────────────────────────────

export async function summariseMarketing(
  params:  SummariseMarketingParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  // Fetch company name
  const { data: co } = await admin
    .from('companies')
    .select('id, name')
    .eq('id', params.company_id)
    .single()

  if (!co) return JSON.stringify({ success: false, error: 'Company not found' })

  // Fetch last 3 months of snapshots for all platforms
  const { data: snapshots, error } = await admin
    .from('marketing_snapshots')
    .select('platform, metric_key, value_number, period_start')
    .eq('group_id', context.groupId)
    .eq('company_id', params.company_id)
    .order('period_start', { ascending: false })
    .limit(200)

  if (error) return JSON.stringify({ success: false, error: error.message })
  if (!snapshots || snapshots.length === 0) {
    return JSON.stringify({ success: false, error: 'No marketing data available for this company.' })
  }

  // Build a compact text summary of the data for Claude to analyse
  const dataLines: string[] = []
  const grouped: Record<string, Record<string, number>> = {}

  for (const snap of snapshots) {
    const key = `${snap.platform as string}::${(snap.period_start as string).slice(0, 7)}`
    if (!grouped[key]) grouped[key] = {}
    grouped[key][snap.metric_key as string] = snap.value_number as number
  }

  for (const [key, metrics] of Object.entries(grouped)) {
    const [platform, period] = key.split('::') as [MarketingPlatform, string]
    const platformLabel = MARKETING_PLATFORM_LABELS[platform] ?? platform
    const platformMetrics = MARKETING_METRICS[platform] ?? []
    const metricParts = platformMetrics
      .filter(m => metrics[m.key] !== undefined)
      .map(m => `${m.label}: ${metrics[m.key]}`)
    if (metricParts.length > 0) {
      dataLines.push(`${platformLabel} (${period}): ${metricParts.join(', ')}`)
    }
  }

  const marketingText = dataLines.join('\n')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY not configured' })
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: `You are a marketing analyst. Analyse the marketing performance data and provide:
1. A brief executive summary (2–3 sentences)
2. Key trends and highlights (top performing channels, notable changes)
3. 2–3 actionable recommendations
Be concise and direct. Format as plain text with clear headings.`,
        messages: [{ role: 'user', content: `Marketing data for ${(co as { name: string }).name}:\n\n${marketingText}` }],
      }),
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } }
      throw new Error(`Anthropic API error ${res.status}: ${errBody.error?.message ?? 'Unknown'}`)
    }

    const message = await res.json() as { content: { type: string; text?: string }[] }
    const summary = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('')

    return JSON.stringify({ success: true, data: { company: (co as { name: string }).name, summary } })
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: `Summarisation failed: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}

// ────────────────────────────────────────────────────────────────────────────
// read_attachment
// ────────────────────────────────────────────────────────────────────────────

export async function readAttachment(
  params:  ReadAttachmentParams,
  context: ToolContext
): Promise<string> {
  const admin = createAdminClient()

  const { data: attachment } = await admin
    .from('agent_run_attachments')
    .select('*')
    .eq('run_id', context.runId)
    .eq('file_name', params.file_name)
    .single()

  if (!attachment) {
    return JSON.stringify({ success: false, error: `Attachment "${params.file_name}" not found for this run` })
  }

  const { data: urlData } = await admin.storage
    .from('agent-runs')
    .createSignedUrl((attachment as { file_path: string }).file_path, 300)

  if (!urlData?.signedUrl) {
    return JSON.stringify({ success: false, error: 'Could not access file' })
  }

  const response = await fetch(urlData.signedUrl)
  if (!response.ok) {
    return JSON.stringify({ success: false, error: 'Failed to download attachment' })
  }

  const fileName = (attachment as { file_name: string }).file_name
  const fileType = (attachment as { file_type: string }).file_type ?? ''
  const isImage  = /\.(png|jpg|jpeg|gif|webp)$/i.test(fileName) || fileType.startsWith('image/')

  if (isImage) {
    const buffer    = await response.arrayBuffer()
    const base64    = Buffer.from(buffer).toString('base64')
    const mediaType = fileType.startsWith('image/') ? fileType : 'image/jpeg'
    return JSON.stringify({
      success:    true,
      type:       'image',
      base64,
      media_type: mediaType,
      file_name:  fileName,
    })
  }

  // Text-based files
  const text = await response.text()
  return JSON.stringify({
    success:   true,
    type:      'text',
    content:   text.slice(0, 50000),
    file_name: fileName,
  })
}
