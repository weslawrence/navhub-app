import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const body = await request.json() as {
    company_id?:  string | null
    platform:     string
    period_start: string
    period_end:   string
    period_type:  string
    metrics:      Record<string, number>
  }

  if (!body.platform || !body.period_start || !body.period_end || !body.metrics) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Filter out blank/null values
  const rows = Object.entries(body.metrics)
    .filter(([, val]) => val !== null && val !== undefined && !isNaN(val))
    .map(([key, val]) => ({
      group_id:     activeGroupId,
      company_id:   body.company_id ?? null,
      platform:     body.platform,
      metric_key:   key,
      value_number: val,
      value_text:   null,
      period_start: body.period_start,
      period_end:   body.period_end,
      period_type:  body.period_type ?? 'month',
      source:       'manual',
      created_by:   session.user.id,
    }))

  if (rows.length === 0) {
    return NextResponse.json({ data: [], message: 'No metrics to save' }, { status: 200 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_snapshots')
    .upsert(rows, {
      onConflict: 'group_id,company_id,platform,metric_key,period_start,period_type',
    })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count: rows.length }, { status: 201 })
}
