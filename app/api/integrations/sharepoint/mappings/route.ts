import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('folder_sharepoint_mappings')
    .select('*, document_folders(name)')
    .eq('group_id', activeGroupId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const body = await request.json() as { folder_id?: string | null; sharepoint_path: string; auto_sync: boolean }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('folder_sharepoint_mappings')
    .upsert({
      group_id:        activeGroupId,
      folder_id:       body.folder_id ?? null,
      sharepoint_path: body.sharepoint_path,
      auto_sync:       body.auto_sync,
    }, { onConflict: 'folder_id,group_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
