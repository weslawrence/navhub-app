import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const companyId  = searchParams.get('company_id')
  const platform   = searchParams.get('platform')
  const periodType = searchParams.get('period_type')
  const from       = searchParams.get('from')
  const to         = searchParams.get('to')

  let query = supabase
    .from('marketing_snapshots')
    .select('*')
    .eq('group_id', activeGroupId)
    .order('period_start', { ascending: false })

  if (companyId)  query = query.eq('company_id', companyId)
  if (platform)   query = query.eq('platform', platform)
  if (periodType) query = query.eq('period_type', periodType)
  if (from)       query = query.gte('period_start', from)
  if (to)         query = query.lte('period_start', to)

  const { data, error } = await query
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

  const body = await request.json() as {
    company_id?:   string | null
    platform:      string
    metric_key:    string
    value_number?: number | null
    value_text?:   string | null
    period_start:  string
    period_end:    string
    period_type:   string
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_snapshots')
    .upsert({
      group_id:     activeGroupId,
      company_id:   body.company_id ?? null,
      platform:     body.platform,
      metric_key:   body.metric_key,
      value_number: body.value_number ?? null,
      value_text:   body.value_text ?? null,
      period_start: body.period_start,
      period_end:   body.period_end,
      period_type:  body.period_type ?? 'month',
      source:       'manual',
      created_by:   session.user.id,
    }, {
      onConflict: 'group_id,company_id,platform,metric_key,period_start,period_type',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
