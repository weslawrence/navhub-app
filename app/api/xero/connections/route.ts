import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies }      from 'next/headers'

export const runtime = 'nodejs'

// ─── GET /api/xero/connections ────────────────────────────────────────────────
// Returns all Xero connections for the active group's companies & divisions.

export async function GET() {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  if (!activeGroupId) {
    return NextResponse.json({ data: [] })
  }

  // Get all company + division IDs for this group
  const { data: companies } = await supabase
    .from('companies')
    .select('id')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)

  const companyIds = (companies ?? []).map(c => c.id)
  if (companyIds.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const { data: divisions } = await supabase
    .from('divisions')
    .select('id')
    .in('company_id', companyIds)
    .eq('is_active', true)

  const divisionIds = (divisions ?? []).map(d => d.id)

  // Build OR filter
  const orParts = [`company_id.in.(${companyIds.join(',')})`]
  if (divisionIds.length > 0) {
    orParts.push(`division_id.in.(${divisionIds.join(',')})`)
  }

  const { data: connections, error } = await supabase
    .from('xero_connections')
    .select('*, company:companies(name), division:divisions(name)')
    .or(orParts.join(','))
    .order('connected_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: connections ?? [] })
}
