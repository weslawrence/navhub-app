import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }            from 'next/headers'
import { NextResponse }       from 'next/server'

/**
 * GET /api/documents/[id]/sharepoint-sync
 * Returns the SharePoint sync status for a specific document.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  // Verify document belongs to group (RLS)
  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', params.id)
    .eq('is_active', true)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data: syncRecord } = await admin
    .from('document_sharepoint_sync')
    .select('sharepoint_item_id, sharepoint_url, last_synced_at, sync_status, error_message')
    .eq('document_id', params.id)
    .maybeSingle()

  return NextResponse.json({ data: syncRecord ?? null })
}
