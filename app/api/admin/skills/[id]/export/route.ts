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

// ── GET /api/admin/skills/[id]/export ────────────────────────────────────────
// Returns the skill plus its knowledge document file_names as a portable
// JSON document. Round-trippable through /api/admin/skills/import.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('skills')
    .select('*, skill_knowledge_documents(file_name, file_type)')
    .eq('id', params.id)
    .eq('tier', 'platform')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })

  const r = data as Record<string, unknown>
  const payload = {
    schema:         'navhub-skill-v1',
    name:           r.name,
    slug:           r.slug,
    category:       r.category,
    description:    r.description,
    instructions:   r.instructions,
    knowledge_text: r.knowledge_text,
    examples:       r.examples,
    tool_grants:    r.tool_grants,
    is_active:      r.is_active,
    knowledge_documents: r.skill_knowledge_documents,
  }
  return NextResponse.json({ data: payload })
}
