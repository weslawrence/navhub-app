import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { FinancialData } from '@/lib/types'

// ─── GET /api/reports/data ────────────────────────────────────────────────────
// Returns financial snapshot data for all companies in the active group,
// for the requested period and report type.
//
// Query params:
//   ?type=profit_loss|balance_sheet|cashflow
//   ?period=YYYY-MM
//
// Response:
//   { data: { company_id, company_name, data: FinancialData | null }[] }
//
// Rollup rule: if a company has division-level snapshots for the period,
// prefer them over a company-level snapshot (same rule as dashboard summary).
// When multiple divisions have data, the first (by created_at) is used.
// Companies are returned in alphabetical order.

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url)
  const reportType       = searchParams.get('type')
  const period           = searchParams.get('period')

  if (!reportType || !period) {
    return NextResponse.json({ error: 'type and period are required' }, { status: 400 })
  }

  // ── Get companies for this group ─────────────────────────────────────────

  const { data: companies, error: compError } = await supabase
    .from('companies')
    .select('id, name')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)
    .order('name')

  if (compError) {
    return NextResponse.json({ error: compError.message }, { status: 500 })
  }

  const companyList = companies ?? []
  const companyIds  = companyList.map(c => c.id)

  if (companyIds.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // ── Get divisions ────────────────────────────────────────────────────────

  const { data: divisions } = await supabase
    .from('divisions')
    .select('id, name, company_id')
    .in('company_id', companyIds)
    .eq('is_active', true)

  const divisionList  = divisions ?? []
  const divisionIds   = divisionList.map(d => d.id)

  // Build division_id → company_id lookup
  const divToCompany: Record<string, string> = {}
  for (const div of divisionList) {
    divToCompany[div.id] = div.company_id
  }

  // ── Fetch snapshots for this period + report type ────────────────────────

  const orParts = [`company_id.in.(${companyIds.join(',')})`]
  if (divisionIds.length > 0) {
    orParts.push(`division_id.in.(${divisionIds.join(',')})`)
  }

  const { data: snapshots, error: snapError } = await supabase
    .from('financial_snapshots')
    .select('company_id, division_id, data, synced_at')
    .eq('period', period)
    .eq('report_type', reportType)
    .or(orParts.join(','))
    .order('synced_at', { ascending: false }) // most recent first for division dedup

  if (snapError) {
    return NextResponse.json({ error: snapError.message }, { status: 500 })
  }

  // ── Build per-company data map ────────────────────────────────────────────

  // company_id → company-level snapshot data
  const companySnapMap = new Map<string, FinancialData>()
  // company_id → first division-level snapshot data (prefer over company-level)
  const divisionSnapMap = new Map<string, FinancialData>()

  for (const snap of (snapshots ?? [])) {
    if (snap.company_id) {
      // Only keep the most recent company-level snapshot
      if (!companySnapMap.has(snap.company_id)) {
        companySnapMap.set(snap.company_id, snap.data as FinancialData)
      }
    } else if (snap.division_id) {
      const compId = divToCompany[snap.division_id]
      if (compId && !divisionSnapMap.has(compId)) {
        // Take the first (most recent) division snapshot per company
        divisionSnapMap.set(compId, snap.data as FinancialData)
      }
    }
  }

  // ── Build final response array ───────────────────────────────────────────

  const result = companyList.map(company => {
    // Division data takes precedence over company-level
    const data = divisionSnapMap.get(company.id) ?? companySnapMap.get(company.id) ?? null
    return {
      company_id:   company.id,
      company_name: company.name,
      data,
    }
  })

  return NextResponse.json({ data: result })
}
