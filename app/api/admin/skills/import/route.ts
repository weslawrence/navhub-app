import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'skill'
}

// ── POST /api/admin/skills/import ────────────────────────────────────────────
// Accepts the JSON shape produced by /api/admin/skills/[id]/export and
// inserts a new platform skill (always as a draft — admin must publish).
// Knowledge documents from the export are NOT re-imported automatically —
// they need to be re-linked manually after import.
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

  const name         = typeof body.name         === 'string' ? body.name.trim()         : ''
  const description  = typeof body.description  === 'string' ? body.description.trim()  : ''
  const instructions = typeof body.instructions === 'string' ? body.instructions.trim() : ''
  if (!name || !description || !instructions) {
    return NextResponse.json(
      { error: 'name, description and instructions are required in the import payload' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('skills')
    .insert({
      tier:           'platform',
      group_id:       null,
      name,
      slug:           slugify(typeof body.slug === 'string' && body.slug ? body.slug : name),
      category:       typeof body.category    === 'string' ? body.category    : null,
      description,
      instructions,
      knowledge_text: typeof body.knowledge_text === 'string' ? body.knowledge_text : null,
      examples:       typeof body.examples       === 'string' ? body.examples       : null,
      tool_grants:    Array.isArray(body.tool_grants)
        ? (body.tool_grants as unknown[]).filter((x): x is string => typeof x === 'string')
        : [],
      is_active:      body.is_active !== false,
      is_published:   false,                // imports always start as drafts
      version:        1,
      created_by:     session.user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
