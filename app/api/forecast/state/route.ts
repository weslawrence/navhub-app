import { NextResponse } from 'next/server'
import { cookies }      from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ForecastUserState } from '@/lib/types'

// ─── GET /api/forecast/state ──────────────────────────────────────────────────
// Returns current user's saved forecast state for the active group.
// Returns defaults if no state exists.
//
// ─── PATCH /api/forecast/state ────────────────────────────────────────────────
// Upserts the user's forecast state for the active group.
// Body: ForecastUserState

const DEFAULT_STATE: ForecastUserState = {
  year:    1,
  showGP:  false,
  showAll: true,
  rates:   {},
}

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

  const { data: row } = await supabase
    .from('forecast_user_state')
    .select('state')
    .eq('user_id', session.user.id)
    .eq('group_id', activeGroupId)
    .single()

  const state = (row?.state as ForecastUserState | null) ?? DEFAULT_STATE

  return NextResponse.json({ data: state })
}

export async function PATCH(request: Request) {
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

  let body: ForecastUserState
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const admin = createAdminClient()
  const { error } = await admin
    .from('forecast_user_state')
    .upsert({
      user_id:    session.user.id,
      group_id:   activeGroupId,
      state:      body,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,group_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: body })
}
