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
  readCompanies,
  generateReport,
  sendSlack,
  sendEmail,
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
  | { type: 'text';       content: string }
  | { type: 'tool_start'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_end';   tool: string; output: string }
  | { type: 'error';      message: string }
  | { type: 'done';       tokens: number }

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
  read_companies: {
    name:        'read_companies',
    description: 'List all companies (and optionally divisions) in the active group with their status and integration info.',
    input_schema: {
      type: 'object',
      properties: {
        include_divisions: { type: 'boolean', description: 'Whether to include divisions under each company.' },
      },
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
}

// ────────────────────────────────────────────────────────────────────────────
// System prompt builder
// ────────────────────────────────────────────────────────────────────────────

async function buildSystemPrompt(
  agent:        Agent,
  groupName:    string,
  context:      RunContext,
  groupId:      string
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

  // Available periods
  const { data: periods } = await admin
    .from('financial_snapshots')
    .select('period')
    .eq('report_type', 'profit_loss')
    .order('period', { ascending: false })
    .limit(12)
  const periodList = (periods ?? [])
    .map((p: { period: string }) => p.period)
    .filter((p: string, i: number, a: string[]) => a.indexOf(p) === i)
    .join(', ') || 'none available'

  const personaText = agent.persona_preset !== 'custom'
    ? PRESETS[agent.persona_preset as keyof typeof PRESETS]
    : (agent.persona ?? '')

  return [
    `You are ${agent.name}, an AI agent for ${groupName}.`,
    personaText ? `\n${personaText}` : '',
    agent.instructions ? `\nYour task: ${agent.instructions}` : '',
    '\nContext:',
    `* Current date: ${today}`,
    `* Financial year: July–June (Australian FY${fy})`,
    `* Active group: ${groupName}`,
    `* Companies in scope: ${companyNames}`,
    context.period ? `* Current period: ${context.period}` : '',
    '\nAvailable data:',
    `* Financial periods available: ${periodList}`,
    context.extra_instructions ? `\nAdditional instructions: ${context.extra_instructions}` : '',
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
  model:      AgentModel,
  messages:   AnthropicMessage[],
  tools:      object[],
  systemPrompt: string,
  onChunk:    (chunk: string) => void
): Promise<ModelResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
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

      if (evType === 'content_block_delta') {
        const delta = event.delta as Record<string, unknown>
        if (delta.type === 'text_delta') {
          const chunk = delta.text as string
          fullText += chunk
          onChunk(chunk)
        }
      } else if (evType === 'content_block_start') {
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
        if (delta.type === 'input_json_delta' && toolUses.length > 0) {
          const last = toolUses[toolUses.length - 1]
          // Accumulate JSON — will be parsed at message_stop
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
    case 'read_companies':
      return readCompanies(input as unknown as Parameters<typeof readCompanies>[0], context)
    case 'generate_report':
      return generateReport(input as unknown as Parameters<typeof generateReport>[0], context)
    case 'send_slack':
      return sendSlack(input as unknown as Parameters<typeof sendSlack>[0], context)
    case 'send_email':
      return sendEmail(input as unknown as Parameters<typeof sendEmail>[0], context)
    default:
      return `Unknown tool: ${toolName}`
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

    // Build system prompt
    const systemPrompt = await buildSystemPrompt(agent, groupName, context, groupId)

    // Build tool list
    const enabledTools = (agent.tools ?? []) as AgentTool[]
    const toolDefs = enabledTools
      .filter(t => ALL_TOOL_DEFS[t])
      .map(t => ALL_TOOL_DEFS[t])

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

    // Agentic loop — continue until no more tool calls
    while (continueLoop) {
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
        })
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

        onChunk({ type: 'tool_start', tool: toolName, input: tc.input })

        let output: string
        try {
          output = await executeTool(toolName, tc.input, agent, groupId, groupName, runId, credentials)
        } catch (err) {
          output = `Error: ${err instanceof Error ? err.message : 'Unknown error'}`
        }

        const durationMs = Date.now() - startTs
        onChunk({ type: 'tool_end', tool: toolName, output })

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
      }

      // Add tool results to messages
      messages.push({ role: 'user', content: toolResults })
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

    onChunk({ type: 'error', message })
  }
}
