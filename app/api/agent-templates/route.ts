import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// ── GET /api/agent-templates ────────────────────────────────────────────────
// Public-ish endpoint (auth required) — returns ONLY published templates and
// ONLY the user-visible fields. The hidden behaviour fields (persona,
// instructions, communication_style, response_length) are never exposed
// here — they're applied automatically by the runner.
export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_templates')
    .select('id, name, slug, category, description, summary_capabilities, avatar_preset, avatar_url, color, is_featured, sort_order, use_count')
    .eq('is_published', true)
    .order('is_featured', { ascending: false })
    .order('sort_order',  { ascending: true })
    .order('name',        { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
