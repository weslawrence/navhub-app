import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('documents')
    .select('tags')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)

  const tagSet: Record<string, boolean> = {}
  for (const row of data ?? []) {
    const tags = (row as { tags?: string[] }).tags
    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (t) tagSet[t] = true
      }
    }
  }
  const allTags = Object.keys(tagSet).sort()

  return NextResponse.json({ data: allTags })
}
