import { NextRequest, NextResponse } from 'next/server'
import { cookies }                    from 'next/headers'
import { createClient }                from '@/lib/supabase/server'
import { createAdminClient }           from '@/lib/supabase/admin'

type AccessLevel = 'none' | 'read' | 'write'
type FeatureKey  = 'financials' | 'reports' | 'documents' | 'marketing' | 'agents'

const FEATURES: FeatureKey[] = ['financials', 'reports', 'documents', 'marketing', 'agents']

type Matrix = Record<FeatureKey, Record<string, AccessLevel>>

// GET — returns { mode, matrix: { feature: { companyKey: access } } }
//   companyKey === 'default' for null company_id
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('agent_company_access')
      .select('feature, company_id, access')
      .eq('agent_id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const matrix: Matrix = {} as Matrix
    FEATURES.forEach(f => { matrix[f] = { default: 'none' } })

    for (const row of data ?? []) {
      const feat = row.feature as FeatureKey
      if (!FEATURES.includes(feat)) continue
      const key = row.company_id ?? 'default'
      if (!matrix[feat]) matrix[feat] = {}
      matrix[feat][key] = row.access as AccessLevel
    }

    // Derive "mode": if zero rows exist → 'all'; else 'specific'
    const mode: 'all' | 'specific' = (data && data.length > 0) ? 'specific' : 'all'

    return NextResponse.json({ data: { mode, matrix } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PUT — body: { mode: 'all'|'specific', matrix: Matrix }
//   Deletes all rows for this agent, inserts from matrix (skipping 'none').
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase    = createClient()
    const cookieStore = cookies()
    void cookieStore

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const admin = createAdminClient()

    const body = await req.json() as {
      mode:   'all' | 'specific'
      matrix: Matrix
    }

    // Always start fresh
    await admin
      .from('agent_company_access')
      .delete()
      .eq('agent_id', params.id)

    // If 'all' mode, no rows needed — empty table == full access
    if (body.mode === 'all' || !body.matrix) {
      // Clear legacy company_scope too
      await admin
        .from('agents')
        .update({ company_scope: null })
        .eq('id', params.id)
      return NextResponse.json({ success: true })
    }

    // Build rows from matrix
    type Row = { agent_id: string; feature: FeatureKey; company_id: string | null; access: AccessLevel }
    const rows: Row[] = []

    for (const feature of FEATURES) {
      const featurePerms = body.matrix[feature] ?? {}
      for (const [key, access] of Object.entries(featurePerms)) {
        if (access === 'none') continue
        rows.push({
          agent_id:   params.id,
          feature,
          company_id: key === 'default' ? null : key,
          access,
        })
      }
    }

    if (rows.length > 0) {
      const { error } = await admin
        .from('agent_company_access')
        .insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Keep legacy agents.company_scope in sync for backward compat:
    //   set of company_ids that have any non-'none' access on any feature
    const scopeIds = new Set<string>()
    for (const row of rows) {
      if (row.company_id) scopeIds.add(row.company_id)
    }
    const scopeArr = Array.from(scopeIds)
    await admin
      .from('agents')
      .update({ company_scope: scopeArr.length > 0 ? scopeArr : null })
      .eq('id', params.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
