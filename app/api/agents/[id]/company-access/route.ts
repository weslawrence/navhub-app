import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('agent_company_access')
    .select('id, company_id, access')
    .eq('agent_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const body = await request.json() as { mode: 'all' | 'specific'; access: Record<string, string> }
  const admin = createAdminClient()

  // Delete existing
  await admin.from('agent_company_access').delete().eq('agent_id', params.id)

  if (body.mode === 'specific' && body.access) {
    const rows = Object.entries(body.access)
      .filter(([, v]) => v !== 'none')
      .map(([companyId, access]) => ({
        agent_id: params.id, company_id: companyId, access,
      }))
    if (rows.length > 0) {
      await admin.from('agent_company_access').insert(rows)
    }
  }

  // Also update legacy company_scope on agent for backward compat
  const scopeIds = body.mode === 'all' ? [] : Object.entries(body.access).filter(([, v]) => v !== 'none').map(([k]) => k)
  await admin.from('agents').update({ company_scope: scopeIds.length > 0 ? scopeIds : null }).eq('id', params.id)

  return NextResponse.json({ success: true })
}
