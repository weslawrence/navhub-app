/**
 * NavHub Assistant helpers
 * Shared types + pure utility functions for the chat assistant feature.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssistantContext {
  pathname:         string
  groupName:        string
  companyName?:     string
  userRole:         string
  agents:           { id: string; name: string; tools: string[]; is_active: boolean }[]
  templates:        { id: string; name: string; template_type: string }[]
  recentRuns:       { id: string; agentName: string; status: string; created_at: string; duration_seconds: number | null }[]
  companies:        { id: string; name: string }[]
  recentDocuments:  { id: string; title: string; document_type: string; created_at: string }[]
  recentReports:    { id: string; name: string; created_at: string }[]
  folders:          { id: string; name: string }[]
}

export interface AssistantQuestion {
  question:     string
  options:      string[]
  multiSelect?: boolean
}

export interface AssistantMessage {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  brief?:    string | null       // extracted agent brief if present
  question?: AssistantQuestion | null  // structured question card if present
}

// ─── Brief extraction ─────────────────────────────────────────────────────────

/**
 * Parses [BRIEF_START]...[BRIEF_END] markers from assistant response text.
 * Returns the display text (markers removed) and the extracted brief (or null).
 */
export function extractBrief(text: string): { displayText: string; brief: string | null } {
  const match = /\[BRIEF_START\]([\s\S]*?)\[BRIEF_END\]/g.exec(text)
  if (!match) return { displayText: text, brief: null }

  const brief       = match[1].trim()
  const displayText = text.replace(/\[BRIEF_START\][\s\S]*?\[BRIEF_END\]/g, '').trim()
  return { displayText, brief }
}

// ─── Question extraction ──────────────────────────────────────────────────────

/**
 * Parses [QUESTION_START]...[QUESTION_END] markers from assistant response text.
 * The marker content must be a JSON object: { question, options, multiSelect? }
 * Returns the display text (markers removed) and the extracted question (or null).
 */
export function extractQuestion(text: string): { displayText: string; question: AssistantQuestion | null } {
  const match = /\[QUESTION_START\]([\s\S]*?)\[QUESTION_END\]/g.exec(text)
  if (!match) return { displayText: text, question: null }

  let question: AssistantQuestion | null = null
  try {
    const parsed = JSON.parse(match[1].trim()) as AssistantQuestion
    // Validate structure
    if (
      typeof parsed.question === 'string' &&
      Array.isArray(parsed.options) &&
      parsed.options.length >= 2
    ) {
      question = parsed
    }
  } catch { /* invalid JSON — ignore */ }

  const displayText = text.replace(/\[QUESTION_START\][\s\S]*?\[QUESTION_END\]/g, '').trim()
  return { displayText, question }
}

// ─── System prompt builder ────────────────────────────────────────────────────

/**
 * Builds the system prompt string from the assembled context.
 * Pure function — safe to call on server or client.
 */
export function buildSystemPrompt(context: AssistantContext, isAdmin = false): string {
  // ── Agents ──
  const agentsList = context.agents.length > 0
    ? context.agents.map(a => {
        const status = a.is_active ? '' : ' [DISABLED]'
        return `• ${a.name}${status} (tools: ${a.tools.join(', ')})`
      }).join('\n')
    : '(no agents configured)'

  // ── Templates ──
  const templatesList = context.templates.length > 0
    ? context.templates.map(t => `• ${t.name} (${t.template_type})`).join('\n')
    : '(no templates available)'

  // ── Recent runs ──
  const runsList = context.recentRuns.length > 0
    ? context.recentRuns.map(r => {
        const dur = r.duration_seconds != null ? ` — ${r.duration_seconds}s` : ''
        return `• ${r.agentName} — ${r.status}${dur} (${r.created_at.slice(0, 10)})`
      }).join('\n')
    : '(no recent runs)'

  // ── Companies ──
  const companiesList = context.companies.length > 0
    ? context.companies.map(c => `• ${c.name}`).join('\n')
    : '(no companies)'

  // ── Recent documents ──
  const docsList = context.recentDocuments.length > 0
    ? context.recentDocuments.map(d => `• ${d.title} (${d.document_type}, ${d.created_at.slice(0, 10)})`).join('\n')
    : '(no recent documents)'

  // ── Recent reports ──
  const reportsList = context.recentReports.length > 0
    ? context.recentReports.map(r => `• ${r.name} (${r.created_at.slice(0, 10)})`).join('\n')
    : '(no recent reports)'

  // ── Folders ──
  const foldersList = context.folders.length > 0
    ? context.folders.map(f => `• ${f.name}`).join('\n')
    : '(no document folders)'

  let prompt = `You are ${context.groupName ? `the NavHub Assistant for ${context.groupName}` : 'NavHub Assistant'}, an intelligent helper built into the NavHub platform.

You are a knowledgeable, helpful assistant with full understanding of NavHub's features. Your job is to help users get the most out of the platform — guiding them on features, answering questions about their data, helping craft agent briefs, and assisting with any task they bring to you.

You can help with ANYTHING the user asks, including:
- Explaining and guiding use of any NavHub feature (agents, reports, documents, marketing, financials, integrations, settings, scheduling, SharePoint sync, etc.)
- Answering questions about the user's data, companies, agents, reports and documents
- Crafting briefs for agents to complete any task — financial analysis, document creation, HR content, creative writing, jokes, or anything else
- Navigating users to the right part of the app to complete their task
- Setting up agents, configuring settings, managing users
- Any other task the user needs help with

Current context:
- Page: ${context.pathname}
- Group: ${context.groupName}${context.companyName ? `\n- Company: ${context.companyName}` : ''}
- User role: ${context.userRole}

Available agents:
${agentsList}

Available report templates:
${templatesList}

Recent agent runs (last 10):
${runsList}

Companies in this group:
${companiesList}

Recent documents (last 5):
${docsList}

Recent custom reports (last 5):
${reportsList}

Document folders:
${foldersList}

NAVIGATION GUIDE — when users ask how to do something, direct them to:
- Create/manage agents → /agents (click + New Agent or gear icon on existing agent)
- Run an agent → click the agent tile or Run button → /agents/[id]/run
- View run history → /agents/runs
- Reports library → /reports/custom
- Documents → /documents
- Integrations (Xero, SharePoint, marketing) → /integrations
- Settings → /settings
- Scheduled runs → click calendar icon on agent tile
- User management → /settings → Members tab
- Agent tools/knowledge → /settings → Agents tab

RESPONSE BEHAVIOUR:
- Be direct and action-oriented. Make reasonable assumptions — do NOT ask unnecessary clarifying questions.
- If you genuinely cannot proceed without one specific piece of information, ask ONLY ONE question with 2–4 clickable options.
- NEVER ask open-ended questions without options. NEVER ask more than one question per response.
- When you must ask, emit: [QUESTION_START]{"question":"...","options":[...],"multiSelect":false}[QUESTION_END]
- Never refuse a reasonable request. If a task is outside NavHub's direct capabilities, guide the user to the best available approach.
- Never tell the user something is "outside scope" — find a way to help.

When helping with agent briefs:
- Draft a specific, actionable brief the user can use directly
- Reference the exact template NAME (not ID) — agents must always look up IDs themselves
- NEVER include a template_id or any UUID in a brief
- Always instruct the agent to: (1) call list_report_templates to find the template by name, (2) use the returned template_id with read_report_template, (3) then render_report
- End your brief with: [BRIEF_START]...[BRIEF_END]
- Agents can create documents, reports, or any other content — brief them accordingly

Keep responses concise and practical. Use markdown for structure when helpful.`

  if (isAdmin) {
    prompt += `\n\nYou are in superadmin mode. You can also help with:
- Platform health questions
- Diagnosing agent run failures across all groups
- Understanding system-level issues`
  }

  return prompt
}
