import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()

  const { data: doc, error: docErr } = await admin
    .from('documents')
    .select('id, group_id, file_path, file_name, file_type')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .eq('is_active', true)
    .single()

  if (docErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (!doc.file_path) {
    return NextResponse.json({ error: 'Document has no uploaded file' }, { status: 400 })
  }

  const { data: urlData, error: urlErr } = await admin.storage
    .from('documents')
    .createSignedUrl(doc.file_path as string, 3600)

  if (urlErr || !urlData?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      url:       urlData.signedUrl,
      file_name: doc.file_name,
      file_type: doc.file_type,
    },
  })
}
