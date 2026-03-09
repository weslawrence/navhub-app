/**
 * Agent Tool Implementations
 * SERVER-SIDE ONLY — never import in client components.
 *
 * Each exported function corresponds to a tool that agents can invoke.
 * Functions receive already-validated parameters and return a formatted string.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getSummaryValue } from '@/lib/financial'
import type { FinancialData, Agent } from '@/lib/types'

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

  const { data: companies } = await admin
    .from('companies')
    .select('id, name, description, industry, is_active')
    .eq('group_id', context.groupId)
    .order('name')

  if (!companies || companies.length === 0) {
    return 'No companies found for this group.'
  }

  // Check Xero connections
  const companyIds = companies.map((c: { id: string }) => c.id)
  const { data: xeroConns } = await admin
    .from('xero_connections')
    .select('company_id, division_id')
    .in('company_id', companyIds)

  const xeroCompanyIds = new Set(
    (xeroConns ?? [])
      .filter((x: { company_id: string | null }) => x.company_id)
      .map((x: { company_id: string }) => x.company_id)
  )

  const lines: string[] = [`Companies in ${context.groupName}:\n`]

  for (const company of companies as Array<{ id: string; name: string; description: string | null; industry: string | null; is_active: boolean }>) {
    const status  = company.is_active ? 'Active' : 'Inactive'
    const hasXero = xeroCompanyIds.has(company.id) ? 'Xero connected' : 'No Xero'
    lines.push(`• ${company.name} (${status} | ${hasXero})${company.industry ? ` — ${company.industry}` : ''}`)

    if (params.include_divisions) {
      const { data: divs } = await admin
        .from('divisions')
        .select('name, is_active')
        .eq('company_id', company.id)
        .order('name')

      for (const div of (divs ?? []) as Array<{ name: string; is_active: boolean }>) {
        lines.push(`  └ ${div.name} (${div.is_active ? 'Active' : 'Inactive'})`)
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

  // Convert markdown to styled HTML
  const html = buildReportHtml(params.title, params.content)

  // Save to Supabase Storage
  const timestamp   = Date.now()
  const safeName    = params.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
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
      uploaded_by:   'agent',
      is_draft:      true,
      draft_notes:   `Generated by agent "${context.agent.name}"`,
      agent_run_id:  context.runId,
    })
    .select('id, name')
    .single()

  if (dbErr || !report) {
    // Clean up storage
    await admin.storage.from('report-files').remove([storagePath])
    return `Error saving report record: ${dbErr?.message ?? 'Unknown error'}`
  }

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
