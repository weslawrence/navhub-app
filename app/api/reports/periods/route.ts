import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'

// ─── GET /api/reports/periods ─────────────────────────────────────────────────
// Returns all distinct periods available in financial_snapshots for the active
// group, ordered most-recent first. Also lists which report types are present
// for each period.
//
// Response:
//   { data: { periods: string[], report_types: Record<period, ReportType[]> } }

export async function GET() {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  if (!activeGroupId) {
    return NextResponse.json({ error: 'No active group' }, { status: 400 })
  }

  // ── Get company IDs for this group ──────────────────────────────────────

  const { data: companies } = await supabase
    .from('companies')
    .select('id')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)

  const companyIds = (companies ?? []).map(c => c.id)

  if (companyIds.length === 0) {
    return NextResponse.json({ data: { periods: [], report_types: {} } })
  }

  // ── Get division IDs ─────────────────────────────────────────────────────

  const { data: divisions } = await supabase
    .from('divisions')
    .select('id')
    .in('company_id', companyIds)
    .eq('is_active', true)

  const divisionIds = (divisions ?? []).map(d => d.id)

  // ── Fetch all distinct period / report_type combos ───────────────────────

  const orParts = [`company_id.in.(${companyIds.join(',')})`]
  if (divisionIds.length > 0) {
    orParts.push(`division_id.in.(${divisionIds.join(',')})`)
  }

  const { data: snapshots } = await supabase
    .from('financial_snapshots')
    .select('period, report_type')
    .or(orParts.join(','))
    .order('period', { ascending: false })

  if (!snapshots || snapshots.length === 0) {
    return NextResponse.json({ data: { periods: [], report_types: {} } })
  }

  // ── Build response ───────────────────────────────────────────────────────
  // Avoid Map/Set iteration — tsconfig has no target, no downlevelIteration.
  // Use array deduplication instead.

  const allPeriods = snapshots.map(s => s.period as string)
  const periods = allPeriods
    .filter((p, i) => allPeriods.indexOf(p) === i)
    .sort((a, b) => b.localeCompare(a))

  const report_types: Record<string, string[]> = {}
  periods.forEach(period => {
    const allTypes = snapshots
      .filter(s => s.period === period)
      .map(s => s.report_type as string)
    report_types[period] = allTypes.filter((t, i) => allTypes.indexOf(t) === i)
  })

  return NextResponse.json({ data: { periods, report_types } })
}
