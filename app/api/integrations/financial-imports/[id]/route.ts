import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── DELETE — remove import record + underlying document + storage file ─────

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()

  const { data: imp } = await admin
    .from('financial_imports')
    .select('id, group_id, document_id, file_path')
    .eq('id', params.id)
    .single()

  if (!imp || imp.group_id !== activeGroupId) {
    return NextResponse.json({ error: 'Import not found' }, { status: 404 })
  }

  // Delete the underlying document (hard delete — this is an import record, not a living doc)
  if (imp.document_id) {
    await admin.from('documents').delete().eq('id', imp.document_id)
  }
  // Delete the file from storage
  if (imp.file_path) {
    void admin.storage.from('documents').remove([imp.file_path])
  }
  // Delete the import record
  await admin.from('financial_imports').delete().eq('id', params.id)

  return NextResponse.json({ data: { deleted: true } })
}
