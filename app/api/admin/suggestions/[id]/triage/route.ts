import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime     = 'nodejs'
export const maxDuration = 60

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

const ALLOWED_CATEGORIES = ['feature_request', 'bug_report', 'workflow_friction', 'knowledge_gap', 'other']

// ── POST /api/admin/suggestions/[id]/triage ─────────────────────────────────
// Calls Claude Haiku with the structured triage prompt, parses the JSON
// response, persists it as `sage_triage` and bumps the suggestion to
// `triaged` status. Cheap + fast: Haiku is intentional here — triage is a
// classification task.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: suggestion } = await admin
    .from('user_suggestions')
    .select('*')
    .eq('id', params.id)
    .single()
  if (!suggestion) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  const s = suggestion as {
    what_trying:   string
    what_happened: string
    what_wanted:   string
  }

  const triagePrompt = `You are Sage, triaging a user feedback submission for NavHub.

User feedback:
- What they were trying to do: ${s.what_trying}
- What happened: ${s.what_happened}
- What they wanted: ${s.what_wanted}

Analyse this feedback and respond with JSON only — no surrounding markdown or commentary.

Required JSON keys:
- category:         one of [feature_request, bug_report, workflow_friction, knowledge_gap, other]
- routing:          one of [bug_pipeline, suggestion_review]
- similar_count:    integer estimate of how many other users likely experience this (1-100)
- existing_feature: { exists: boolean, explanation: string }
- related_findings: short array of strings — recent Sage findings this might connect to (or [])
- disposition:      one of [acknowledge_and_decline, acknowledge_and_act, escalate_to_builder, hold_for_pattern]
- reasoning:        2-3 sentences explaining your recommendation
- user_response:    1-2 sentence draft response to the user (warm but honest)`

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), 45_000)

  let triage: Record<string, unknown> = {}
  let raw    = ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system:     'You are Sage, triaging a user feedback submission. Respond with raw JSON only — no markdown fences, no commentary.',
        messages:   [{ role: 'user', content: triagePrompt }],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return NextResponse.json({ error: `Anthropic API ${res.status}: ${errBody.slice(0, 200)}` }, { status: 502 })
    }
    const json = await res.json() as { content: Array<{ type: string; text?: string }> }
    raw = json.content.map(c => c.text ?? '').join('')

    // Strip optional ```json fences the model sometimes adds despite the
    // system instruction.
    const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim()
    try {
      triage = JSON.parse(cleaned) as Record<string, unknown>
    } catch {
      triage = { raw: cleaned }
    }
  } finally {
    clearTimeout(timer)
  }

  const categoryRaw = typeof triage.category === 'string' ? triage.category.toLowerCase() : null
  const category    = categoryRaw && ALLOWED_CATEGORIES.includes(categoryRaw) ? categoryRaw : null

  const { data: updated, error: updErr } = await admin
    .from('user_suggestions')
    .update({
      sage_triage: triage,
      category,
      status:      'triaged',
    })
    .eq('id', params.id)
    .select('*')
    .single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ data: updated })
}
