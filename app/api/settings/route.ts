import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULTS = { currency: 'AUD', number_format: 'thousands', fy_end_month: 6 }

// ─── GET /api/settings ────────────────────────────────────────────────────────
export async function GET() {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('currency, number_format, fy_end_month')
    .eq('user_id', session.user.id)
    .maybeSingle()

  return NextResponse.json({ data: settings ?? DEFAULTS })
}

// ─── PATCH /api/settings ─────────────────────────────────────────────────────
// Body: { currency?, number_format?, fy_end_month? }
export async function PATCH(request: Request) {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const VALID_FORMATS    = ['thousands', 'full', 'smart']
  const VALID_CURRENCIES = ['AUD', 'NZD', 'USD', 'GBP', 'SGD']

  const updates: Record<string, unknown> = {
    user_id:    session.user.id,
    updated_at: new Date().toISOString(),
  }

  if (typeof body.currency === 'string') {
    if (!VALID_CURRENCIES.includes(body.currency)) {
      return NextResponse.json({ error: `Invalid currency. Must be one of: ${VALID_CURRENCIES.join(', ')}` }, { status: 422 })
    }
    updates.currency = body.currency
  }

  if (typeof body.number_format === 'string') {
    if (!VALID_FORMATS.includes(body.number_format)) {
      return NextResponse.json({ error: `Invalid number_format. Must be one of: ${VALID_FORMATS.join(', ')}` }, { status: 422 })
    }
    updates.number_format = body.number_format
  }

  if (typeof body.fy_end_month === 'number') {
    const m = body.fy_end_month
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return NextResponse.json({ error: 'fy_end_month must be an integer between 1 and 12' }, { status: 422 })
    }
    updates.fy_end_month = m
  }

  const admin = createAdminClient()
  const { data: settings, error } = await admin
    .from('user_settings')
    .upsert(updates, { onConflict: 'user_id' })
    .select('currency, number_format, fy_end_month')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: settings })
}
