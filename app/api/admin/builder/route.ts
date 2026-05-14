import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime     = 'nodejs'
export const maxDuration = 120

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

// ── POST /api/admin/builder ─────────────────────────────────────────────────
// Builder Assistant chat endpoint. Streams a single Claude response back as
// plain text (no SSE — the page reads the body progressively). The system
// prompt injects the full platform catalogue (templates / skills /
// knowledge) so the assistant doesn't suggest duplicates and can recommend
// existing skills + knowledge for new templates.
//
// Body: { messages: [{ role: 'user'|'assistant', content: string }], context?: 'templates'|'skills'|'knowledge' }
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const messages = Array.isArray(body.messages) ? body.messages as Array<{ role: string; content: string }> : []
  if (messages.length === 0) return NextResponse.json({ error: 'messages required' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  // Build the platform catalogue snapshot the assistant references.
  const admin = createAdminClient()
  const [{ data: templates }, { data: skills }, { data: knowledge }] = await Promise.all([
    admin.from('agent_templates').select('id, name, category, description').order('category'),
    admin.from('skills').select('id, name, category, description, tier').order('category'),
    admin.from('platform_knowledge').select('id, title, category').eq('is_active', true).order('category'),
  ])

  const tpls  = (templates ?? []) as Array<{ id: string; name: string; category: string; description: string }>
  const skls  = (skills    ?? []) as Array<{ id: string; name: string; category: string | null; description: string; tier: string }>
  const knls  = (knowledge ?? []) as Array<{ id: string; title: string; category: string | null }>

  const ctxLabel = typeof body.context === 'string' ? body.context : 'general'

  const systemPrompt = `You are the NavHub Builder Assistant, helping the platform operator
design new agent templates, skills and platform knowledge. The current
focus area is: **${ctxLabel}**.

You have full read access to the existing platform catalogue. Use it to:
- Avoid suggesting duplicates
- Recommend existing skills + knowledge for new templates
- Spot gaps in coverage

## Existing agent templates (${tpls.length})
${tpls.map(t => `- [${t.category}] ${t.name} — ${t.description.slice(0, 120)}`).join('\n') || '- (none)'}

## Existing skills (${skls.length})
${skls.map(s => `- [${s.tier}/${s.category ?? 'general'}] ${s.name} — ${s.description.slice(0, 120)}`).join('\n') || '- (none)'}

## Existing platform knowledge (${knls.length})
${knls.map(k => `- [${k.category ?? 'general'}] ${k.title}`).join('\n') || '- (none)'}

## How to help
- When drafting a new template, output it as a JSON block tagged with
  \`\`\`json so the UI can offer a "Save as draft" button. Required keys:
  name, slug, category, description, summary_capabilities, persona,
  instructions, communication_style, response_length,
  recommended_skill_ids (array of skill IDs from the catalogue above),
  recommended_knowledge_ids (array of knowledge IDs above).
- When drafting a skill or knowledge entry, follow the same pattern with
  the appropriate schema.
- For review tasks (e.g. "improve this template"), give specific edits
  and explain trade-offs.
- Be direct. Operators want concrete suggestions, not generic advice.`

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), 90_000)

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        system:     systemPrompt,
        messages,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Anthropic fetch failed' }, { status: 502 })
  }
  clearTimeout(timer)

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return NextResponse.json({ error: `Anthropic ${res.status}: ${errText.slice(0, 200)}` }, { status: 502 })
  }

  const json = await res.json() as { content: Array<{ type: string; text?: string }> }
  const text = json.content.map(c => c.text ?? '').join('')
  return NextResponse.json({ data: { text } })
}
