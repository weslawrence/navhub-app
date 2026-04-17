import { NextRequest, NextResponse } from 'next/server'
import { cookies }                    from 'next/headers'
import { createClient }               from '@/lib/supabase/server'
import { createAdminClient }          from '@/lib/supabase/admin'

type AccessLevel = 'none' | 'read' | 'write'

// GET — returns all company access rows for this agent
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
      .select('company_id, access')
      .eq('agent_id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PUT — replaces all company access rows for this agent
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase    = createClient()
    const cookieStore = cookies()
    void cookieStore // reserved for future group-ownership check

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

    const admin = createAdminClient()

    const body = await req.json() as {
      mode:   'all' | 'specific'
      access: Record<string, AccessLevel>
    }

    // Delete existing rows
    await admin
      .from('agent_company_access')
      .delete()
      .eq('agent_id', params.id)

    // If specific mode, insert new rows (skip 'none')
    if (body.mode === 'specific' && body.access) {
      const rows = Object.entries(body.access)
        .filter(([, level]) => level !== 'none')
        .map(([companyId, access]) => ({
          agent_id:   params.id,
          company_id: companyId,
          access,
        }))

      if (rows.length > 0) {
        const { error } = await admin
          .from('agent_company_access')
          .insert(rows)

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    // Keep legacy company_scope on the agent in sync for backward compat
    const scopeIds = body.mode === 'all'
      ? []
      : Object.entries(body.access ?? {})
          .filter(([, v]) => v !== 'none')
          .map(([k]) => k)
    await admin
      .from('agents')
      .update({ company_scope: scopeIds.length > 0 ? scopeIds : null })
      .eq('id', params.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
