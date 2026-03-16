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

export interface AssistantMessage {
  id:       string
  role:     'user' | 'assistant'
  content:  string
  brief?:   string | null   // extracted agent brief if present
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

  let prompt = `You are NavHub Assistant, an intelligent helper built into the NavHub financial dashboard application.

You help users with three things:
1. App guidance — explaining how to use NavHub features, navigation, settings
2. Data questions — answering questions about the user's financial data, agents, reports
3. Agent briefing — helping users craft effective briefs for NavHub agents to generate reports, documents, and analysis

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

When helping with agent briefs:
- Ask clarifying questions if needed (what period? what audience? what company?)
- Draft a specific, actionable brief the user can use directly
- Reference the exact template name or agent name where relevant
- End your brief draft with the marker: [BRIEF_START]...[BRIEF_END] so the UI can extract it

Keep responses concise and practical. Use markdown for structure when helpful. You are not a general-purpose AI — stay focused on NavHub and the user's data/workflows.`

  if (isAdmin) {
    prompt += `\n\nYou are in superadmin mode. You can also help with:
- Platform health questions
- Diagnosing agent run failures across all groups
- Understanding system-level issues`
  }

  return prompt
}
