import { NextResponse }  from 'next/server'
import { createClient }  from '@/lib/supabase/server'
import { cookies }       from 'next/headers'

export const runtime = 'nodejs'

// ─── GET /api/uploads ─────────────────────────────────────────────────────────
// Returns all excel_uploads for the active group, with company/division names.

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

  // Get company IDs for this group
  const { data: companies } = await supabase
    .from('companies')
    .select('id')
    .eq('group_id', activeGroupId)

  const companyIds = (companies ?? []).map(c => c.id)
  if (companyIds.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Get division IDs for these companies
  const { data: divisions } = await supabase
    .from('divisions')
    .select('id')
    .in('company_id', companyIds)

  const divisionIds = (divisions ?? []).map(d => d.id)

  // Build filter
  const orParts: string[] = [`company_id.in.(${companyIds.join(',')})`]
  if (divisionIds.length > 0) {
    orParts.push(`division_id.in.(${divisionIds.join(',')})`)
  }

  const { data: uploads, error } = await supabase
    .from('excel_uploads')
    .select('*, company:companies(name), division:divisions(name)')
    .or(orParts.join(','))
    .order('uploaded_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: uploads ?? [] })
}
