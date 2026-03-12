import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  // Verify document belongs to active group
  const { data: doc } = await supabase
    .from('documents')
    .select('id')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('document_versions')
    .select('*')
    .eq('document_id', params.id)
    .order('version', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
