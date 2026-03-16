/**
 * NavHub Assistant helpers
 * Shared types + pure utility functions for the chat assistant feature.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssistantContext {
  pathname:     string
  groupName:    string
  companyName?: string
  userRole:     string
  agents:       { id: string; name: string; tools: string[] }[]
  templates:    { id: string; name: string; type: string }[]
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
  const agentsList = context.agents.length > 0
    ? context.agents.map(a => `• ${a.name} (tools: ${a.tools.join(', ')})`).join('\n')
    : '(no agents configured)'

  const templatesList = context.templates.length > 0
    ? context.templates.map(t => `• ${t.name} (${t.type})`).join('\n')
    : '(no templates available)'

  let prompt = `You are NavHub Assistant, an intelligent helper built into the NavHub financial dashboard application.

You help users with three things:
1. App guidance — explaining how to use NavHub features, navigation, settings
2. Data questions — answering questions about the user's financial data, agents, reports
3. Agent briefing — helping users craft effective briefs for NavHub agents to generate reports, documents, and analysis

Current context:
- Page: ${context.pathname}
- Group: ${context.groupName}${context.companyName ? `\n- Company: ${context.companyName}` : ''}
- User role: ${context.userRole}
- Available agents:
${agentsList}
- Available templates:
${templatesList}

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
