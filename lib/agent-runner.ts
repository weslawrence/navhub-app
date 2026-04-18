  /**
 * Agent Runner — Core Execution Engine
 * SERVER-SIDE ONLY — never import in client components.
 *
 * Orchestrates model calls, tool execution, streaming, and run persistence.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/encryption'
import {
  readFinancials,
  generateReport,
  sendSlack,
  sendEmail,
  listReportTemplates,
  readReportTemplate,
  createReportTemplate,
  updateReportTemplate,
  renderReport,
  analyseDocument,
  listDocuments,
  readDocument,
  createDocument,
  updateDocument,
  readCashflow,
  readCashflowItems,
  suggestCashflowItem,
  updateCashflowItem,
  createCashflowSnapshot,
  summariseCashflow,
  readMarketingData,
  summariseMarketing,
  readAttachment,
} from '@/lib/agent-tools'
import type {
  Agent,
  AgentModel,
  AgentTool,
  ToolCallLog,
} from '@/lib/types'
import { PERSONA_PRESETS as PRESETS } from '@/lib/types'

// ────────────────────────────────────────────────────────────────────────────
// Event types emitted during a run
// ────────────────────────────────────────────────────────────────────────────

export type RunEvent =
  | { type: 'text';            content: string }
  | { type: 'tool_start';      tool: string; input: Record<string, unknown> }
  | { type: 'tool_end';        tool: string; output: string }
  | { type: 'error';           message: string }
  | { type: 'done';            tokens: number }
  | { type: 'cancelled' }
  | { type: 'awaiting_input';  question: string; interaction_id: string }

export interface RunContext {
  period?:              string
  company_ids?:         string[]
  extra_instructions?:  string
}

// ────────────────────────────────────────────────────────────────────────────
// Tool definitions (Claude API format)
// ────────────────────────────────────────────────────────────────────────────

const ALL_TOOL_DEFS: Record<string, object> = {
  read_financials: {
    name:        'read_financials',
    description: 'Retrieve financial snapshot data (P&L and/or Balance Sheet) for one or more companies across specified periods.',
    input_schema: {
      type: 'object',
      properties: {
        company_ids:  { type: 'array',  items: { type: 'string' }, description: 'Company UUIDs to query. Empty array = all companies in scope.' },
        periods:      { type: 'array',  items: { type: 'string' }, description: 'Periods in YYYY-MM format, e.g. ["2026-01","2026-02"]' },
        report_types: { type: 'array',  items: { type: 'string', enum: ['profit_loss', 'balance_sheet'] }, description: 'Report types to fetch.' },
      },
      required: ['periods', 'report_types'],
    },
  },
  generate_report: {
    name:        'generate_report',
    description: 'Generate a professionally styled HTML report from markdown content and save it as a draft in the Reports Library.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Report title.' },
        content:     { type: 'string', description: 'Full report content in markdown.' },
        description: { type: 'string', description: 'Optional brief description of the report.' },
      },
      required: ['title', 'content'],
    },
  },
  send_slack: {
    name:        'send_slack',
    description: 'Post a message to a Slack channel via the group\'s configured webhook.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message text to send.' },
        channel: { type: 'string', description: 'Slack channel override (e.g. "#finance"). Uses agent or group default if omitted.' },
      },
      required: ['message'],
    },
  },
  send_email: {
    name:        'send_email',
    description: 'Send an email to one or more recipients via Resend.',
    input_schema: {
      type: 'object',
      properties: {
        to:               { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses.' },
        subject:          { type: 'string', description: 'Email subject.' },
        body:             { type: 'string', description: 'Email body in markdown, converted to HTML.' },
        attach_report_id: { type: 'string', description: 'Optional custom_report ID to include as a signed URL link in the email.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  list_report_templates: {
    name:        'list_report_templates',
    description: 'List all report templates available to the current group. Returns a list where each template has a template_id field — use that value when calling read_report_template or render_report.',
    input_schema: {
      type: 'object',
      properties: {
        template_type: {
          type: 'string',
          enum: ['financial', 'matrix', 'narrative', 'dashboard', 'workflow'],
          description: 'Optional filter by type.',
        },
      },
    },
  },
  read_report_template: {
    name:        'read_report_template',
    description: 'Fetch a report template\'s definition (slots, design tokens, metadata). Scaffold HTML/CSS/JS is NOT returned by default to save tokens — the response includes scaffold_size (total chars) so you can judge whether loading it is needed. Pass include_scaffold:true only when you need to read or modify the actual scaffold code.',
    input_schema: {
      type: 'object',
      properties: {
        template_id:       { type: 'string', description: 'UUID of the template.' },
        include_scaffold:  { type: 'boolean', description: 'Set to true to include scaffold_html, scaffold_css, scaffold_js in the response. Defaults to false.' },
      },
      required: ['template_id'],
    },
  },
  create_report_template: {
    name:        'create_report_template',
    description: 'Create a new report template. Use after analysing a document or following user instructions.',
    input_schema: {
      type: 'object',
      properties: {
        name:               { type: 'string' },
        template_type:      { type: 'string', enum: ['financial', 'matrix', 'narrative', 'dashboard', 'workflow'] },
        description:        { type: 'string' },
        design_tokens:      { type: 'object', description: 'CSS variable names mapped to values.' },
        slots:              { type: 'array',  description: 'Array of slot definitions.' },
        scaffold_html:      { type: 'string', description: 'HTML scaffold with {{slot_name}} placeholders.' },
        scaffold_css:       { type: 'string', description: 'CSS with {{token_name}} placeholders.' },
        scaffold_js:        { type: 'string', description: 'Optional JavaScript.' },
        agent_instructions: { type: 'string', description: 'Instructions for future agents using this template.' },
      },
      required: ['name', 'template_type', 'slots'],
    },
  },
  update_report_template: {
    name:        'update_report_template',
    description: 'Update an existing template. Automatically saves the current version before updating.',
    input_schema: {
      type: 'object',
      properties: {
        template_id: { type: 'string' },
        changes: {
          type: 'object',
          description: 'Fields to update: name, description, design_tokens, slots, scaffold_html, scaffold_css, scaffold_js, agent_instructions.',
        },
      },
      required: ['template_id', 'changes'],
    },
  },
  render_report: {
    name:        'render_report',
    description: 'Fill a template with slot data and save to the Reports Library. REQUIRED SEQUENCE: (1) Call list_report_templates to get the template_id — never guess or assume an ID. (2) Call read_report_template with that template_id to see the slot definitions. (3) Call render_report with the template_id, slot_data matching the slot definitions, and a report_name. The template_id must be a UUID obtained from list_report_templates.',
    input_schema: {
      type: 'object',
      properties: {
        template_id: { type: 'string' },
        slot_data:   { type: 'object', description: 'Map of slot names to values.' },
        report_name: { type: 'string', description: 'Name for the saved report.' },
        notes:       { type: 'string', description: 'Optional notes.' },
      },
      required: ['template_id', 'slot_data', 'report_name'],
    },
  },
  analyse_document: {
    name:        'analyse_document',
    description: 'Analyse an uploaded document and propose a report template definition. Returns a proposal — does NOT save automatically.',
    input_schema: {
      type: 'object',
      properties: {
        file_url:     { type: 'string', description: 'URL of uploaded file in Supabase Storage or a signed URL.' },
        file_content: { type: 'string', description: 'Text content of the document if already extracted.' },
        instructions: { type: 'string', description: 'User instructions about what to extract.' },
      },
    },
  },
  list_documents: {
    name:        'list_documents',
    description: 'List documents. Use folder_type: "templates" to find template documents that can be used as structural guides.',
    input_schema: {
      type: 'object',
      properties: {
        document_type: { type: 'string', description: 'Optional filter by document type.' },
        company_id:    { type: 'string', description: 'Optional filter by company UUID.' },
        folder_id:     { type: 'string', description: 'Optional filter by folder UUID.' },
        folder_type:   { type: 'string', enum: ['general', 'templates'], description: 'Optional filter by folder type. Use "templates" to find template documents.' },
      },
    },
  },
  read_document: {
    name:        'read_document',
    description: 'Read the full content of a document by ID.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'UUID of the document.' },
      },
      required: ['document_id'],
    },
  },
  create_document: {
    name:        'create_document',
    description: 'Create a new document in the NavHub Documents section. Use this to save agent-generated analysis, reports, or other content as a formal document.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        document_type: {
          type: 'string',
          enum: [
            'financial_analysis','cash_flow_review','board_report',
            'budget_vs_actual','job_description','org_structure',
            'entity_relationship','business_health','tax_position',
            'due_diligence','investor_briefing',
          ],
        },
        audience: {
          type: 'string',
          enum: ['board','management','investor','internal','hr','external'],
          description: 'Intended audience — shapes tone and depth.',
        },
        content_markdown: {
          type: 'string',
          description: 'Full document content in markdown. Use headings (##), tables, bullet lists as appropriate.',
        },
        company_id: { type: 'string', description: 'Optional — associate with a specific company UUID.' },
        folder_id:  { type: 'string', description: 'Optional — save to a specific folder UUID.' },
        notes:      { type: 'string', description: 'Optional notes about this document.' },
      },
      required: ['title', 'document_type', 'audience', 'content_markdown'],
    },
  },
  update_document: {
    name:        'update_document',
    description: 'Update the content of an existing document. Automatically saves the previous version before updating.',
    input_schema: {
      type: 'object',
      properties: {
        document_id:      { type: 'string' },
        content_markdown: { type: 'string', description: 'New full document content in markdown.' },
        title:            { type: 'string', description: 'Optional new title.' },
        reason:           { type: 'string', description: 'Why this document is being updated.' },
      },
      required: ['document_id', 'content_markdown'],
    },
  },
  read_cashflow: {
    name:        'read_cashflow',
    description: 'Read the 13-week rolling cash flow forecast for a company. Returns week-by-week summary with opening/closing balances, net cash flow, and risk indicators.',
    input_schema: {
      type: 'object',
      properties: {
        company_id: { type: 'string', description: 'UUID of the company to fetch the forecast for.' },
      },
      required: ['company_id'],
    },
  },
  read_cashflow_items: {
    name:        'read_cashflow_items',
    description: 'List the recurring and one-off cash flow line items (inflows, outflows, payables) for a company.',
    input_schema: {
      type: 'object',
      properties: {
        company_id: { type: 'string', description: 'UUID of the company.' },
        section:    { type: 'string', enum: ['inflow', 'regular_outflow', 'payable'], description: 'Optional filter by section.' },
      },
      required: ['company_id'],
    },
  },
  suggest_cashflow_item: {
    name:        'suggest_cashflow_item',
    description: 'Suggest a new cash flow line item for human review. The item is created with pending_review=true so the user can accept or reject it.',
    input_schema: {
      type: 'object',
      properties: {
        company_id:    { type: 'string', description: 'UUID of the company.' },
        label:         { type: 'string', description: 'Human-readable name for the line item.' },
        section:       { type: 'string', enum: ['inflow', 'regular_outflow', 'payable'], description: 'Which section this item belongs to.' },
        amount:        { type: 'number', description: 'Dollar amount (not cents).' },
        recurrence:    { type: 'string', enum: ['weekly', 'fortnightly', 'monthly', 'one_off'], description: 'How often this item occurs.' },
        start_date:    { type: 'string', description: 'ISO date when this item starts (YYYY-MM-DD).' },
        end_date:      { type: 'string', description: 'Optional ISO date when this item ends (YYYY-MM-DD).' },
        day_of_week:   { type: 'number', description: 'For weekly/fortnightly: 0=Sunday … 6=Saturday.' },
        day_of_month:  { type: 'number', description: 'For monthly: day of month (1–31).' },
        reason:        { type: 'string', description: 'Why you are suggesting this item.' },
      },
      required: ['company_id', 'label', 'section', 'amount', 'recurrence', 'start_date'],
    },
  },
  update_cashflow_item: {
    name:        'update_cashflow_item',
    description: 'Update an existing cash flow item — typically to accept a pending_review item (set pending_review:false) or adjust its label/amount.',
    input_schema: {
      type: 'object',
      properties: {
        item_id:        { type: 'string', description: 'UUID of the cash flow item to update.' },
        pending_review: { type: 'boolean', description: 'Set to false to accept/approve the item.' },
        label:          { type: 'string', description: 'New label for the item.' },
        amount:         { type: 'number', description: 'New dollar amount (not cents).' },
        is_active:      { type: 'boolean', description: 'Set to false to deactivate (soft delete) the item.' },
      },
      required: ['item_id'],
    },
  },
  create_cashflow_snapshot: {
    name:        'create_cashflow_snapshot',
    description: 'Save a named snapshot of the current 13-week forecast for a company. Useful for preserving a point-in-time view before making changes.',
    input_schema: {
      type: 'object',
      properties: {
        company_id: { type: 'string', description: 'UUID of the company.' },
        name:       { type: 'string', description: 'Name for this snapshot (e.g. "Pre-budget baseline Mar 2026").' },
        notes:      { type: 'string', description: 'Optional notes about why this snapshot was taken.' },
      },
      required: ['company_id', 'name'],
    },
  },
  summarise_cashflow: {
    name:        'summarise_cashflow',
    description: 'Generate an AI-powered executive summary of the 13-week cash flow forecast, including risks and recommendations.',
    input_schema: {
      type: 'object',
      properties: {
        company_id: { type: 'string', description: 'UUID of the company to summarise.' },
      },
      required: ['company_id'],
    },
  },
  read_marketing_data: {
    name:        'read_marketing_data',
    description: 'Fetch marketing performance data (web, social, ads, email/CRM metrics) for one or all companies. Returns structured metric values grouped by platform and period.',
    input_schema: {
      type: 'object',
      properties: {
        company_id:  { type: 'string',                description: 'Optional: UUID of a specific company. Omit for group-wide data.' },
        platforms:   { type: 'array', items: { type: 'string' }, description: 'Optional: filter to specific platforms (e.g. ["ga4","meta"]). Omit for all platforms.' },
        period:      { type: 'string',                description: 'Optional: YYYY-MM period to fetch. Defaults to latest available.' },
        num_periods: { type: 'number',                description: 'Optional: how many past periods to include (1–12). Default 3.' },
      },
      required: [],
    },
  },
  summarise_marketing: {
    name:        'summarise_marketing',
    description: 'Generate an AI-powered executive summary of marketing performance for a specific company, including trends and recommendations.',
    input_schema: {
      type: 'object',
      properties: {
        company_id: { type: 'string', description: 'UUID of the company to summarise marketing data for.' },
        period:     { type: 'string', description: 'Optional: YYYY-MM period to focus on. Defaults to latest available.' },
      },
      required: ['company_id'],
    },
  },
  ask_user: {
    name:        'ask_user',
    description: 'Pause the run and ask the user a clarifying question. The run will resume automatically once they respond. Use when you need specific information that is not available in your context. Keep questions concise and ask only one at a time.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask the user. Be specific about what information you need.' },
        context:  { type: 'string', description: 'Optional: brief explanation of why you need this information.' },
      },
      required: ['question'],
    },
  },
  read_attachment: {
    name:        'read_attachment',
    description: 'Read the content of a file attached to this agent run. For images, returns vision data. For text files, returns content. Use the file_name exactly as listed in the system prompt.',
    input_schema: {
      type: 'object',
      properties: {
        file_name: { type: 'string', description: 'The exact filename of the attachment as listed in the run context.' },
      },
      required: ['file_name'],
    },
  },
}

// ────────────────────────────────────────────────────────────────────────────
// System prompt builder
// ────────────────────────────────────────────────────────────────────────────

async function buildSystemPrompt(
  agent:        Agent,
  groupName:    string,
  context:      RunContext,
  groupId:      string,
  attachments?: Array<{ file_name: string; file_type: string }>
): Promise<string> {
  const admin   = createAdminClient()
  const today   = new Date().toISOString().split('T')[0]
  const fyStart = new Date().getMonth() >= 6
    ? new Date().getFullYear()
    : new Date().getFullYear() - 1
  const fy      = `${fyStart}–${fyStart + 1}`

  // Load company names in scope
  let companyNames = 'all companies'
  if (agent.company_scope && agent.company_scope.length > 0) {
    const { data: companies } = await admin
      .from('companies')
      .select('name')
      .in('id', agent.company_scope)
    companyNames = (companies ?? []).map((c: { name: string }) => c.name).join(', ')
  } else {
    const { data: companies } = await admin
      .from('companies')
      .select('name')
      .eq('group_id', groupId)
      .eq('is_active', true)
    companyNames = (companies ?? []).map((c: { name: string }) => c.name).join(', ') || 'none configured'
  }

  // Available periods — limit to 6 most recent to reduce system prompt size
  const { data: periods } = await admin
    .from('financial_snapshots')
    .select('period')
    .eq('report_type', 'profit_loss')
    .order('period', { ascending: false })
    .limit(6)
  const periodList = (periods ?? [])
    .map((p: { period: string }) => p.period)
    .filter((p: string, i: number, a: string[]) => a.indexOf(p) === i)
    .join(', ') || 'none available'

  const personaText = agent.persona_preset !== 'custom'
    ? PRESETS[agent.persona_preset as keyof typeof PRESETS]
    : (agent.persona ?? '')

  // Communication style guidance
  const commStyle = (agent.communication_style as string | undefined) ?? 'balanced'
  const styleText = commStyle === 'formal'
    ? 'Communicate in a formal, professional tone. Use precise language suitable for executive audiences.'
    : commStyle === 'casual'
    ? 'Use a friendly, conversational tone. Keep language approachable and avoid unnecessary jargon.'
    : '' // balanced = no special instruction

  // Response length guidance
  const respLength = (agent.response_length as string | undefined) ?? 'balanced'
  const lengthText = respLength === 'concise'
    ? 'Keep responses concise and to the point. Include only the key facts and recommendations.'
    : respLength === 'detailed'
    ? 'Provide thorough, detailed responses with full context, reasoning, and explanation.'
    : '' // balanced = no special instruction

  // ── Knowledge base injection ───────────────────────────────────────────
  const knowledgeParts: string[] = []

  if (agent.knowledge_text) {
    knowledgeParts.push(`\nBackground Knowledge:\n${agent.knowledge_text}`)
  }

  const kLinks = (agent.knowledge_links ?? []) as Array<{ url: string; label?: string }>
  if (kLinks.length > 0) {
    const linkLines = kLinks.map(l => `- ${l.label ?? l.url}: ${l.url}`).join('\n')
    knowledgeParts.push(`\nReference Links:\n${linkLines}`)
  }

  // Knowledge documents — fetch and include content summaries
  if (agent.id) {
    try {
      const { data: kDocs } = await admin
        .from('agent_knowledge_documents')
        .select('file_name, document_id')
        .eq('agent_id', agent.id)

      if (kDocs && kDocs.length > 0) {
        const docIds = kDocs
          .map((kd: { document_id: string | null }) => kd.document_id)
          .filter((id: string | null): id is string => !!id)

        let docContents: Record<string, string> = {}
        if (docIds.length > 0) {
          const { data: docs } = await admin
            .from('documents')
            .select('id, content_markdown')
            .in('id', docIds)
          if (docs) {
            docContents = docs.reduce((acc: Record<string, string>, d: { id: string; content_markdown: string | null }) => {
              if (d.content_markdown) acc[d.id] = d.content_markdown
              return acc
            }, {} as Record<string, string>)
          }
        }

        const docSummaries = kDocs.map((kd: { file_name: string; document_id: string | null }) => {
          const content = kd.document_id ? docContents[kd.document_id] : null
          return `- ${kd.file_name}: ${content ? content.slice(0, 500) + '...' : '(no extracted content)'}`
        }).join('\n')
        knowledgeParts.push(`\nKnowledge Documents:\n${docSummaries}`)
      }
    } catch { /* ignore knowledge doc fetch errors */ }
  }

  return [
    `You are ${agent.name}, an AI agent for ${groupName}.`,
    personaText ? `\n${personaText}` : '',
    styleText   ? `\nStyle: ${styleText}` : '',
    lengthText  ? `\nDepth: ${lengthText}` : '',
    agent.instructions ? `\nYour task: ${agent.instructions}` : '',
    '\nContext:',
    `* Current date: ${today}`,
    `* Financial year: July–June (Australian FY${fy})`,
    `* Active group: ${groupName}`,
    `* Companies in scope: ${companyNames}`,
    context.period ? `* Current period: ${context.period}` : '',
    '\nAvailable data:',
    `* Financial periods available: ${periodList}`,
    ...knowledgeParts,
    context.extra_instructions ? `\nAdditional instructions: ${context.extra_instructions}` : '',
    attachments && attachments.length > 0
      ? `\nAttached files for this run:\n${attachments.map(a => `• ${a.file_name} (${a.file_type})`).join('\n')}\nUse the read_attachment tool to read the content of any attached file before referencing it.`
      : '',
    '\nCRITICAL TOOL SEQUENCING RULES:',
    '* NEVER call read_report_template without first calling list_report_templates to obtain the template_id',
    '* NEVER call render_report without first calling list_report_templates AND read_report_template',
    '* NEVER assume, guess, or hardcode a template_id — always look it up via list_report_templates first',
    '* list_report_templates returns template_id fields — copy the exact UUID value into subsequent calls',
    '* If you think you know the template_id, you are wrong — always call list_report_templates first',
    '* Use ask_user when you need specific information from the user (e.g. which company, which period, preferred format). Ask one concise question at a time. The user will reply and the run will continue automatically.',
  ].filter(Boolean).join('\n')
}

// ────────────────────────────────────────────────────────────────────────────
// Credential loader
// ────────────────────────────────────────────────────────────────────────────

async function loadCredentials(agentId: string): Promise<Record<string, string>> {
  const admin = createAdminClient()

  const { data: creds } = await admin
    .from('agent_credentials')
    .select('key, value')
    .eq('agent_id', agentId)
    .eq('is_active', true)

  const result: Record<string, string> = {}
  for (const cred of (creds ?? []) as Array<{ key: string; value: string }>) {
    try {
      result[cred.key] = decrypt(cred.value)
    } catch {
      // Skip credentials that fail to decrypt
    }
  }
  return result
}

// ────────────────────────────────────────────────────────────────────────────
// ask_user handler — pauses run and waits for user reply (up to 10 minutes)
// ────────────────────────────────────────────────────────────────────────────

async function handleAskUser(
  question: string,
  runId:    string,
  onChunk:  (event: RunEvent) => void
): Promise<string> {
  const admin = createAdminClient()

  // 1. Insert interaction record
  const { data: interaction, error } = await admin
    .from('agent_run_interactions')
    .insert({ run_id: runId, question })
    .select('id')
    .single()

  if (error || !interaction) {
    return `Error creating interaction: ${error?.message ?? 'unknown'}`
  }

  const interactionId = (interaction as { id: string }).id

  // 2. Set run to awaiting_input
  await admin
    .from('agent_runs')
    .update({
      status:                  'awaiting_input',
      awaiting_input_question: question,
      awaiting_input_at:       new Date().toISOString(),
    })
    .eq('id', runId)

  // 3. Emit SSE event so UI can show reply card
  onChunk({ type: 'awaiting_input', question, interaction_id: interactionId })

  // 4. Poll every 2s for up to 10 minutes
  const maxWaitMs = 10 * 60 * 1_000
  const pollMs    = 2_000
  const deadline  = Date.now() + maxWaitMs

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollMs))

    // Check cancellation first
    const { data: cancelCheck } = await admin
      .from('agent_runs')
      .select('cancellation_requested')
      .eq('id', runId)
      .single()
    if (cancelCheck?.cancellation_requested) {
      return '__CANCELLED__'
    }

    // Check for answer
    const { data: row } = await admin
      .from('agent_run_interactions')
      .select('answer, answered_at')
      .eq('id', interactionId)
      .single()

    if (row?.answered_at && row.answer !== null) {
      // Restore run status to running
      await admin
        .from('agent_runs')
        .update({
          status:                  'running',
          awaiting_input_question: null,
          awaiting_input_at:       null,
        })
        .eq('id', runId)
      return (row as { answer: string }).answer
    }
  }

  // Timed out — treat as cancelled
  return '__CANCELLED__'
}

// ────────────────────────────────────────────────────────────────────────────
// Anthropic Claude API call (streaming)
// ────────────────────────────────────────────────────────────────────────────

interface AnthropicMessage {
  role:    'user' | 'assistant'
  content: string | AnthropicContent[]
}

interface AnthropicContent {
  type:        string
  id?:         string
  name?:       string
  input?:      unknown
  tool_use_id?: string
  content?:    string | Array<{ type: string; text?: string }>
  text?:       string
}

interface ToolUseBlock {
  id:    string
  name:  string
  input: Record<string, unknown>
}

interface ModelResponse {
  text:       string
  tool_calls: ToolUseBlock[]
  tokens:     number
}

async function callClaude(
  model:        AgentModel,
  messages:     AnthropicMessage[],
  tools:        object[],
  systemPrompt: string,
  onChunk:      (chunk: string) => void,
  credentials?: Record<string, string>
): Promise<ModelResponse> {
  // Use BYO key from agent credentials if available, fall back to env var
  const apiKey = credentials?.['anthropic_api_key'] ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable not set')

  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    system:     systemPrompt,
    messages,
    stream:     true,
  }
  if (tools.length > 0) body.tools = tools

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Anthropic API error ${res.status}: ${err.error?.message ?? 'Unknown'}`)
  }

  let fullText  = ''
  const toolUses: ToolUseBlock[] = []
  let inputTokens = 0
  let outputTokens = 0

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body from Anthropic API')

  const decoder = new TextDecoder()
  let buffer    = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      let event: Record<string, unknown>
      try { event = JSON.parse(data) } catch { continue }

      const evType = event.type as string

      if (evType === 'content_block_start') {
        const block = event.content_block as Record<string, unknown>
        if (block.type === 'tool_use') {
          toolUses.push({
            id:    block.id as string,
            name:  block.name as string,
            input: {},
          })
        }
      } else if (evType === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown>
        if (delta.type === 'text_delta') {
          const chunk = delta.text as string
          fullText += chunk
          onChunk(chunk)
        } else if (delta.type === 'input_json_delta' && toolUses.length > 0) {
          // Accumulate tool input JSON fragments — will be parsed after stream ends
          const last = toolUses[toolUses.length - 1]
          const existing = (last.input as Record<string, unknown>).__raw ?? ''
          last.input = { __raw: (existing as string) + (delta.partial_json as string ?? '') }
        }
      } else if (evType === 'message_delta') {
        const usage = event.usage as Record<string, number> | undefined
        if (usage) outputTokens = usage.output_tokens ?? 0
      } else if (evType === 'message_start') {
        const msg = event.message as Record<string, unknown>
        const usage = msg?.usage as Record<string, number> | undefined
        if (usage) inputTokens = usage.input_tokens ?? 0
      }
    }
  }

  // Parse accumulated tool inputs
  for (const tu of toolUses) {
    const raw = (tu.input as Record<string, unknown>).__raw as string | undefined
    if (raw) {
      try { tu.input = JSON.parse(raw) } catch { tu.input = {} }
    }
  }

  return { text: fullText, tool_calls: toolUses, tokens: inputTokens + outputTokens }
}

// ────────────────────────────────────────────────────────────────────────────
// GPT-4o API call (streaming)
// ────────────────────────────────────────────────────────────────────────────

async function callGPT4o(
  messages:     AnthropicMessage[],
  tools:        object[],
  systemPrompt: string,
  credentials:  Record<string, string>,
  onChunk:      (chunk: string) => void
): Promise<ModelResponse> {
  const apiKey = credentials['OPENAI_API_KEY']
  if (!apiKey) throw new Error('OPENAI_API_KEY credential not configured for this agent')

  // Convert messages to OpenAI format
  const oaiMessages: Array<Record<string, unknown>> = [{ role: 'system', content: systemPrompt }]
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      oaiMessages.push({ role: msg.role, content: msg.content })
    } else {
      // Flatten content blocks
      const textContent = (msg.content as AnthropicContent[])
        .filter(b => b.type === 'text')
        .map(b => b.text ?? '')
        .join('\n')
      oaiMessages.push({ role: msg.role, content: textContent })
    }
  }

  // Convert tools to OpenAI function format
  const oaiTools = tools.map((t: object) => {
    const tool = t as Record<string, unknown>
    return {
      type:     'function',
      function: {
        name:        tool.name,
        description: tool.description,
        parameters:  tool.input_schema,
      },
    }
  })

  const body: Record<string, unknown> = {
    model:    'gpt-4o',
    messages: oaiMessages,
    stream:   true,
  }
  if (oaiTools.length > 0) body.tools = oaiTools

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`OpenAI API error ${res.status}: ${err.error?.message ?? 'Unknown'}`)
  }

  let fullText   = ''
  const toolCalls: ToolUseBlock[] = []
  let totalTokens = 0

  const reader  = res.body?.getReader()
  if (!reader) throw new Error('No response body from OpenAI API')

  const decoder = new TextDecoder()
  let buffer    = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      let chunk: Record<string, unknown>
      try { chunk = JSON.parse(data) } catch { continue }

      const choice = (chunk.choices as Array<Record<string, unknown>>)?.[0]
      if (!choice) continue

      const delta = choice.delta as Record<string, unknown>
      if (delta.content) {
        fullText += delta.content as string
        onChunk(delta.content as string)
      }

      // Tool calls
      const tcDeltas = delta.tool_calls as Array<Record<string, unknown>> | undefined
      if (tcDeltas) {
        for (const tc of tcDeltas) {
          const idx = tc.index as number
          while (toolCalls.length <= idx) {
            toolCalls.push({ id: '', name: '', input: {} })
          }
          const fn = tc.function as Record<string, unknown> | undefined
          if (fn?.name) toolCalls[idx].name = fn.name as string
          if (fn?.arguments) {
            const existing = (toolCalls[idx].input as Record<string, unknown>).__raw ?? ''
            toolCalls[idx].input = { __raw: (existing as string) + (fn.arguments as string) }
          }
          if (tc.id) toolCalls[idx].id = tc.id as string
        }
      }

      const usage = chunk.usage as Record<string, number> | undefined
      if (usage) totalTokens = usage.total_tokens ?? 0
    }
  }

  // Parse tool call JSON
  for (const tc of toolCalls) {
    const raw = (tc.input as Record<string, unknown>).__raw as string | undefined
    if (raw) {
      try { tc.input = JSON.parse(raw) } catch { tc.input = {} }
    }
  }

  return { text: fullText, tool_calls: toolCalls, tokens: totalTokens }
}

// ────────────────────────────────────────────────────────────────────────────
// Tool dispatcher
// ────────────────────────────────────────────────────────────────────────────

async function executeTool(
  toolName:    AgentTool,
  input:       Record<string, unknown>,
  agent:       Agent,
  groupId:     string,
  groupName:   string,
  runId:       string,
  credentials: Record<string, string>
): Promise<string> {
  const context = { agent, groupId, groupName, runId, credentials }

  switch (toolName) {
    case 'read_financials':
      return readFinancials(input as unknown as Parameters<typeof readFinancials>[0], context)
    case 'generate_report':
      return generateReport(input as unknown as Parameters<typeof generateReport>[0], context)
    case 'send_slack':
      return sendSlack(input as unknown as Parameters<typeof sendSlack>[0], context)
    case 'send_email':
      return sendEmail(input as unknown as Parameters<typeof sendEmail>[0], context)
    case 'list_report_templates':
      return listReportTemplates(input as unknown as Parameters<typeof listReportTemplates>[0], context)
    case 'read_report_template':
      return readReportTemplate(input as unknown as Parameters<typeof readReportTemplate>[0], context)
    case 'create_report_template':
      return createReportTemplate(input as unknown as Parameters<typeof createReportTemplate>[0], context)
    case 'update_report_template':
      return updateReportTemplate(input as unknown as Parameters<typeof updateReportTemplate>[0], context)
    case 'render_report':
      return renderReport(input as unknown as Parameters<typeof renderReport>[0], context)
    case 'analyse_document':
      return analyseDocument(input as unknown as Parameters<typeof analyseDocument>[0])
    case 'list_documents':
      return listDocuments(input as unknown as Parameters<typeof listDocuments>[0], context)
    case 'read_document':
      return readDocument(input as unknown as Parameters<typeof readDocument>[0], context)
    case 'create_document':
      return createDocument(input as unknown as Parameters<typeof createDocument>[0], context)
    case 'update_document':
      return updateDocument(input as unknown as Parameters<typeof updateDocument>[0], context)
    case 'read_cashflow':
      return readCashflow(input as unknown as Parameters<typeof readCashflow>[0], context)
    case 'read_cashflow_items':
      return readCashflowItems(input as unknown as Parameters<typeof readCashflowItems>[0], context)
    case 'suggest_cashflow_item':
      return suggestCashflowItem(input as unknown as Parameters<typeof suggestCashflowItem>[0], context)
    case 'update_cashflow_item':
      return updateCashflowItem(input as unknown as Parameters<typeof updateCashflowItem>[0], context)
    case 'create_cashflow_snapshot':
      return createCashflowSnapshot(input as unknown as Parameters<typeof createCashflowSnapshot>[0], context)
    case 'summarise_cashflow':
      return summariseCashflow(input as unknown as Parameters<typeof summariseCashflow>[0], context)
    case 'read_marketing_data':
      return readMarketingData(input as unknown as Parameters<typeof readMarketingData>[0], context)
    case 'summarise_marketing':
      return summariseMarketing(input as unknown as Parameters<typeof summariseMarketing>[0], context)
    case 'read_attachment':
      return readAttachment(input as unknown as Parameters<typeof readAttachment>[0], context)
    case 'ask_user':
      // Handled specially in executeAgentRun — should never reach executeTool
      return 'ask_user is handled by the runner directly.'
    default: {
      // Custom webhook tool (created via Settings → Agents → Custom Tools)
      const admin = createAdminClient()
      const { data: customTool } = await admin
        .from('custom_tools')
        .select('webhook_url, http_method, headers')
        .eq('group_id', groupId)
        .eq('name', toolName)
        .eq('is_active', true)
        .maybeSingle()

      if (customTool) {
        try {
          const headers = {
            'Content-Type': 'application/json',
            ...((customTool.headers ?? {}) as Record<string, string>),
          }
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), 30_000)
          const requestInit: RequestInit = {
            method:  customTool.http_method,
            headers,
            signal:  controller.signal,
          }
          if (customTool.http_method !== 'GET') {
            requestInit.body = JSON.stringify(input ?? {})
          }
          const res = await fetch(customTool.webhook_url, requestInit)
          clearTimeout(timer)

          const contentType = res.headers.get('content-type') ?? ''
          let body: unknown
          if (contentType.includes('application/json')) {
            try { body = await res.json() } catch { body = null }
          } else {
            body = (await res.text()).slice(0, 4000)
          }
          return JSON.stringify({ status: res.status, ok: res.ok, response: body })
        } catch (err) {
          return JSON.stringify({ error: `Custom tool "${toolName}" failed: ${String(err)}` })
        }
      }

      // Web search (stub — real implementation would call an external search API)
      if (toolName === 'web_search') {
        return JSON.stringify({
          error: 'Web search tool is enabled but the server-side search provider is not yet configured. Ask an admin to set up the search integration.',
        })
      }

      return `Unknown tool: ${toolName}`
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Notifications
// ────────────────────────────────────────────────────────────────────────────

interface RunForNotify {
  id:                   string
  status:               string
  run_name?:            string | null
  output_document_id?:  string | null
  draft_report_id?:     string | null
  notify_email?:        string | null
  notify_slack_channel?: string | null
}

interface AgentForNotify {
  name:                 string
  notify_on_completion?: boolean
  notify_on_output?:     boolean
  notify_email?:         string | null
  notify_slack_channel?: string | null
}

async function sendRunNotifications(
  run:     RunForNotify,
  agent:   AgentForNotify,
  groupId: string,
): Promise<void> {
  try {
    const emailTo   = run.notify_email         ?? agent.notify_email         ?? null
    const slackChan = run.notify_slack_channel ?? agent.notify_slack_channel ?? null

    const hasOutput               = !!(run.output_document_id || run.draft_report_id)
    const shouldNotifyCompletion  = !!agent.notify_on_completion
    const shouldNotifyOutput      = !!agent.notify_on_output && hasOutput
    const perRunRequested         = !!(run.notify_email || run.notify_slack_channel)

    if (!shouldNotifyCompletion && !shouldNotifyOutput && !perRunRequested) return
    if (!emailTo && !slackChan) return

    const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.navhub.co'
    const runUrl  = `${appUrl}/agents/runs/${run.id}`
    const subject = `Agent run complete: ${run.run_name ?? agent.name}`
    const bodyHtml = `
      <p><strong>${agent.name}</strong> has finished a run.</p>
      ${run.run_name ? `<p>Run: ${run.run_name}</p>` : ''}
      <p>Status: ${run.status}</p>
      <p><a href="${runUrl}">View run →</a></p>
    `

    // Email via Resend
    if (emailTo && process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        const domain = process.env.RESEND_FROM_DOMAIN ?? 'navhub.co'
        await resend.emails.send({
          from:    `NavHub <notifications@${domain}>`,
          to:      emailTo.split(',').map(e => e.trim()).filter(Boolean),
          subject,
          html:    bodyHtml,
        })
      } catch (err) {
        console.error('sendRunNotifications: email failed', err)
      }
    }

    // Slack via bot token
    if (slackChan) {
      try {
        const admin = createAdminClient()
        const { data: conn } = await admin
          .from('slack_connections')
          .select('bot_token_encrypted')
          .eq('group_id', groupId)
          .eq('is_active', true)
          .maybeSingle()

        if (conn?.bot_token_encrypted) {
          const token = decrypt(conn.bot_token_encrypted)
          await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              channel: slackChan,
              text:    `*${agent.name}* run complete${run.run_name ? ` — ${run.run_name}` : ''}\n<${runUrl}|View run>`,
            }),
          })
        }
      } catch (err) {
        console.error('sendRunNotifications: slack failed', err)
      }
    }
  } catch (err) {
    console.error('sendRunNotifications: unexpected error', err)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main execution function
// ────────────────────────────────────────────────────────────────────────────

export async function executeAgentRun(
  runId:     string,
  agent:     Agent,
  context:   RunContext,
  groupName: string,
  onChunk:   (event: RunEvent) => void
): Promise<void> {
  const admin = createAdminClient()

  // Update run status to running
  await admin
    .from('agent_runs')
    .update({ status: 'running', started_at: new Date().toISOString(), model_used: agent.model })
    .eq('id', runId)

  const groupId = agent.group_id

  try {
    // Load credentials
    const credentials = await loadCredentials(agent.id)

    // Fetch attachments for this run
    const { data: runAttachments } = await admin
      .from('agent_run_attachments')
      .select('file_name, file_type')
      .eq('run_id', runId)
    const attachments = (runAttachments ?? []) as Array<{ file_name: string; file_type: string }>

    // Build system prompt (includes attachment context if any)
    const systemPrompt = await buildSystemPrompt(agent, groupName, context, groupId, attachments)

    // Build tool list — ask_user is always included regardless of agent.tools setting
    const enabledTools = (agent.tools ?? []) as AgentTool[]

    // Fetch per-agent tool overrides (enabled flag per tool_name)
    const { data: overrideRows } = await admin
      .from('agent_tool_overrides')
      .select('tool_name, enabled')
      .eq('agent_id', agent.id)
    const disabledToolNames = new Set(
      (overrideRows ?? []).filter(r => !r.enabled).map(r => r.tool_name as string),
    )
    const enabledByOverride = new Set(
      (overrideRows ?? []).filter(r => r.enabled).map(r => r.tool_name as string),
    )

    const toolDefs: Array<Record<string, unknown>> = [
      ...enabledTools
        .filter(t => ALL_TOOL_DEFS[t] && t !== 'ask_user' && !disabledToolNames.has(t))
        .map(t => ALL_TOOL_DEFS[t] as Record<string, unknown>),
      ALL_TOOL_DEFS['ask_user'] as Record<string, unknown>,
    ]

    // Group-level toggles: web search (when enabled group-wide OR per-agent override)
    try {
      const { data: grp } = await admin
        .from('groups')
        .select('web_search_enabled')
        .eq('id', groupId)
        .single()
      const groupWebSearch = !!grp?.web_search_enabled
      const agentWebSearch = enabledByOverride.has('web_search')
      const shouldEnableWebSearch = (groupWebSearch || agentWebSearch) && !disabledToolNames.has('web_search')
      if (shouldEnableWebSearch) {
        toolDefs.push({
          name:        'web_search',
          description: 'Search the public web for current information. Use only when you need up-to-date information not available via internal tools. Returns a list of relevant URLs and snippets.',
          input_schema: {
            type:       'object',
            properties: {
              query: { type: 'string', description: 'The search query.' },
            },
            required: ['query'],
          },
        })
      }
    } catch { /* ignore */ }

    // Inject custom webhook tools for this group
    try {
      const { data: customTools } = await admin
        .from('custom_tools')
        .select('name, description, parameters')
        .eq('group_id', groupId)
        .eq('is_active', true)

      for (const ct of customTools ?? []) {
        if (disabledToolNames.has(ct.name as string)) continue
        const params = (ct.parameters ?? []) as Array<{ name: string; type: string; required: boolean; description: string }>
        toolDefs.push({
          name:        ct.name,
          description: ct.description,
          input_schema: {
            type:       'object',
            properties: Object.fromEntries(params.map(p => [p.name, { type: p.type, description: p.description }])),
            required:   params.filter(p => p.required).map(p => p.name),
          },
        })
      }
    } catch { /* ignore */ }

    // Initial messages
    const messages: AnthropicMessage[] = [
      {
        role:    'user',
        content: [
          context.extra_instructions
            ? `Please complete your assigned task. Additional context: ${context.extra_instructions}`
            : 'Please complete your assigned task.',
          context.period ? `Focus on period: ${context.period}` : '',
          context.company_ids?.length
            ? `Focus on companies: ${context.company_ids.join(', ')}`
            : '',
        ].filter(Boolean).join('\n'),
      },
    ]

    let fullOutput     = ''
    let totalTokens    = 0
    let continueLoop   = true
    const toolCallLogs: ToolCallLog[] = []

    // Loop guards — prevent infinite tool call loops
    const MAX_ITERATIONS   = 10
    const MAX_TOOL_FAILURES = 3
    let   iterationCount   = 0
    const toolFailureCounts: Record<string, number> = {}

    // Agentic loop — continue until no more tool calls
    while (continueLoop) {
      iterationCount++
      if (iterationCount > MAX_ITERATIONS) {
        const msg = '\n\n⚠️ Agent stopped: maximum iterations reached.'
        fullOutput += msg
        onChunk({ type: 'text', content: msg })
        continueLoop = false
        break
      }
      // ── Cancellation checkpoint ──────────────────────────────────────────
      // Poll the DB at the start of every iteration. If a cancel was requested
      // (via POST /api/agents/runs/[id]/cancel) while we were executing tools,
      // we stop here before the next model call.
      const { data: cancelCheck } = await admin
        .from('agent_runs')
        .select('cancellation_requested')
        .eq('id', runId)
        .single()
      if (cancelCheck?.cancellation_requested) {
        await admin
          .from('agent_runs')
          .update({
            status:       'cancelled',
            cancelled_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            tool_calls:   toolCallLogs,
            tokens_used:  totalTokens,
          })
          .eq('id', runId)
        onChunk({ type: 'cancelled' })
        return
      }
      // ────────────────────────────────────────────────────────────────────

      let result: ModelResponse

      if (agent.model === 'gpt-4o') {
        result = await callGPT4o(messages, toolDefs, systemPrompt, credentials, (chunk) => {
          onChunk({ type: 'text', content: chunk })
          fullOutput += chunk
        })
      } else {
        result = await callClaude(agent.model, messages, toolDefs, systemPrompt, (chunk) => {
          onChunk({ type: 'text', content: chunk })
          fullOutput += chunk
        }, credentials)
      }

      totalTokens += result.tokens

      if (result.text) {
        fullOutput += result.text
      }

      if (result.tool_calls.length === 0) {
        // No more tool calls — done
        continueLoop = false
        break
      }

      // Add assistant message with tool uses
      const assistantContent: AnthropicContent[] = []
      if (result.text) {
        assistantContent.push({ type: 'text', text: result.text })
      }
      for (const tc of result.tool_calls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
      }
      messages.push({ role: 'assistant', content: assistantContent })

      // Execute tools
      const toolResults: AnthropicContent[] = []

      for (const tc of result.tool_calls) {
        const toolName = tc.name as AgentTool
        const startTs  = Date.now()

        // Diagnostic log — helps debug tool input issues
        console.log('Tool call raw:', JSON.stringify({
          tool:        tc.name,
          input:       tc.input,
          inputKeys:   Object.keys(tc.input || {}),
          inputValues: Object.values(tc.input || {}),
        }))

        onChunk({ type: 'tool_start', tool: toolName, input: tc.input })

        let output: string

        // ask_user is handled specially — it pauses the run and waits for user input
        if (toolName === 'ask_user') {
          const question = (tc.input.question as string) ?? 'Please provide additional information.'
          const answer   = await handleAskUser(question, runId, onChunk)

          if (answer === '__CANCELLED__') {
            // Cancellation detected during wait — clean up and return
            await admin
              .from('agent_runs')
              .update({
                status:       'cancelled',
                cancelled_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
                tool_calls:   toolCallLogs,
                tokens_used:  totalTokens,
              })
              .eq('id', runId)
            onChunk({ type: 'cancelled' })
            return
          }

          output = `User replied: ${answer}`
        } else {
          try {
            output = await executeTool(toolName, tc.input, agent, groupId, groupName, runId, credentials)
          } catch (err) {
            output = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
          }
        }

        const durationMs = Date.now() - startTs
        onChunk({ type: 'tool_end', tool: toolName, output })

        // Track consecutive tool failures — stop if a tool fails too many times
        if (output.includes('"success":false') || output.startsWith('Error:')) {
          toolFailureCounts[toolName] = (toolFailureCounts[toolName] ?? 0) + 1
          if (toolFailureCounts[toolName] >= MAX_TOOL_FAILURES) {
            const errorMsg = `\n\n⚠️ Agent stopped: ${toolName} failed ${MAX_TOOL_FAILURES} times consecutively. Last error: ${output}`
            fullOutput += errorMsg
            onChunk({ type: 'text', content: errorMsg })
            continueLoop = false
          }
        } else {
          // Reset failure count on success
          toolFailureCounts[toolName] = 0
        }

        toolCallLogs.push({
          tool:        toolName,
          input:       tc.input,
          output:      output.slice(0, 2000), // truncate for storage
          timestamp:   new Date().toISOString(),
          duration_ms: durationMs,
        })

        toolResults.push({
          type:        'tool_result',
          tool_use_id: tc.id,
          content:     output,
        })

        // If loop guard triggered, break inner loop too
        if (!continueLoop) break
      }

      // Add tool results to messages (only if loop is still running)
      if (continueLoop) messages.push({ role: 'user', content: toolResults })
    }

    // Check for generated draft report
    let draftReportId: string | null = null
    const generateToolLog = toolCallLogs.find(t => t.tool === 'generate_report')
    if (generateToolLog) {
      try {
        const parsed = JSON.parse(generateToolLog.output) as { report_id?: string }
        if (parsed.report_id) draftReportId = parsed.report_id
      } catch { /* not JSON */ }
    }

    // Save completed run
    await admin
      .from('agent_runs')
      .update({
        status:          'success',
        output:          fullOutput,
        tool_calls:      toolCallLogs,
        tokens_used:     totalTokens,
        draft_report_id: draftReportId,
        completed_at:    new Date().toISOString(),
      })
      .eq('id', runId)

    // Send notifications (fire-and-forget, won't block run)
    const { data: finalRun } = await admin
      .from('agent_runs')
      .select('id, status, run_name, output_document_id, draft_report_id, notify_email, notify_slack_channel')
      .eq('id', runId)
      .single()
    if (finalRun) {
      void sendRunNotifications(finalRun as RunForNotify, agent as unknown as AgentForNotify, agent.group_id)
    }

    onChunk({ type: 'done', tokens: totalTokens })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during agent run'

    await admin
      .from('agent_runs')
      .update({
        status:        'error',
        error_message: message,
        completed_at:  new Date().toISOString(),
      })
      .eq('id', runId)

    // Send error notification too
    const { data: errRun } = await admin
      .from('agent_runs')
      .select('id, status, run_name, output_document_id, draft_report_id, notify_email, notify_slack_channel')
      .eq('id', runId)
      .single()
    if (errRun) {
      void sendRunNotifications(errRun as RunForNotify, agent as unknown as AgentForNotify, agent.group_id)
    }

    onChunk({ type: 'error', message })
  }
}
