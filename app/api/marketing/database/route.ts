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
  const companyId = searchParams.get('company_id')
  const platform  = searchParams.get('platform')

  let query = supabase
    .from('marketing_database_snapshots')
    .select('*')
    .eq('group_id', activeGroupId)
    .order('snapshot_date', { ascending: false })

  if (companyId) query = query.eq('company_id', companyId)
  if (platform)  query = query.eq('platform', platform)

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
    company_id?:              string | null
    platform:                 string
    total_contacts?:          number | null
    active_contacts?:         number | null
    new_this_period?:         number | null
    unsubscribed_this_period?: number | null
    snapshot_date:            string
    notes?:                   string
  }

  if (!body.platform || !body.snapshot_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('marketing_database_snapshots')
    .upsert({
      group_id:                 activeGroupId,
      company_id:               body.company_id ?? null,
      platform:                 body.platform,
      total_contacts:           body.total_contacts ?? null,
      active_contacts:          body.active_contacts ?? null,
      new_this_period:          body.new_this_period ?? null,
      unsubscribed_this_period: body.unsubscribed_this_period ?? null,
      snapshot_date:            body.snapshot_date,
      source:                   'manual',
      notes:                    body.notes ?? null,
    }, {
      onConflict: 'group_id,company_id,platform,snapshot_date',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
