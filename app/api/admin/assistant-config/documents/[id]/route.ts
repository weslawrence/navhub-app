import { NextResponse }     from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * DELETE /api/admin/assistant-config/documents/[id]
 * Removes an assistant knowledge doc. If it owns a Storage object, deletes that too.
 * super_admin only.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: roleRow } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('role', 'super_admin')
    .limit(1)
  if (!roleRow || roleRow.length === 0) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('assistant_knowledge_documents')
    .select('id, file_path')
    .eq('id', params.id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.file_path) {
    void admin.storage.from('documents').remove([existing.file_path])
  }

  const { error } = await admin
    .from('assistant_knowledge_documents')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
