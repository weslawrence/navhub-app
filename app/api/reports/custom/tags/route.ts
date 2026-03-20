import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// GET /api/reports/custom/tags
// Returns all unique tags across active custom reports for the active group.
export async function GET() {
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) {
    return NextResponse.json({ error: 'No active group' }, { status: 401 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch tags arrays from all active reports in the group (RLS enforces membership)
  const { data, error } = await supabase
    .from('custom_reports')
    .select('tags')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten + deduplicate + sort
  const flat    = (data ?? []).flatMap((r: { tags: string[] }) => r.tags ?? [])
  const allTags = flat.filter((v, i, a) => a.indexOf(v) === i).sort()

  return NextResponse.json({ data: allTags })
}
