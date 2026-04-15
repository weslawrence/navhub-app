import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── DELETE — remove a knowledge document ────────────────────────────────────

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; docId: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('agent_knowledge_documents')
    .delete()
    .eq('id', params.docId)
    .eq('agent_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { deleted: true } })
}
