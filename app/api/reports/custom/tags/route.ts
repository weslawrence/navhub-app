import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/reports/custom/tags
// Returns all unique tags across active custom reports for the active group.
export async function GET() {
  try {
    const cookieStore   = cookies()
    const activeGroupId = cookieStore.get('active_group_id')?.value
    if (!activeGroupId) {
      return NextResponse.json({ error: 'No active group' }, { status: 401 })
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Use admin client to avoid RLS issues with tags column
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('custom_reports')
      .select('tags')
      .eq('group_id', activeGroupId)
      .eq('is_active', true)
      .not('tags', 'is', null)

    if (error) throw error

    // Flatten + deduplicate + sort (avoid Set spread for TS compat)
    const flatTags = (data ?? []).flatMap((r: { tags: string[] | null }) => r.tags ?? []).filter(Boolean)
    const allTags  = flatTags.filter((v, i, a) => a.indexOf(v) === i).sort()

    return NextResponse.json({ data: allTags })
  } catch (err) {
    console.error('Tags API error:', JSON.stringify(err))
    return NextResponse.json({ error: 'Internal server error', detail: String(err) }, { status: 500 })
  }
}
