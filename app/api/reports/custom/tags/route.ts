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

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('custom_reports')
      .select('tags')
      .eq('group_id', activeGroupId)
      .not('tags', 'is', null)

    if (error) {
      console.error('Tags error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Flatten + deduplicate + sort (avoid Set spread for TS compat)
    const allTags = (data ?? [])
      .flatMap((r: { tags: string[] | null }) => r.tags ?? [])
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort()

    return NextResponse.json({ data: allTags })
  } catch (err) {
    const message = err instanceof Error
      ? err.message
      : typeof err === 'object'
        ? JSON.stringify(err)
        : String(err)
    console.error('Tags API error:', message)
    return NextResponse.json({ error: 'Internal server error', detail: message }, { status: 500 })
  }
}
