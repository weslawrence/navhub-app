import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULTS = { currency: 'AUD', number_format: 'thousands' }

// ─── GET /api/settings ────────────────────────────────────────────────────────
// Returns the current user's display settings.
// If no row exists in user_settings, returns defaults without inserting.
export async function GET() {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('currency, number_format')
    .eq('user_id', session.user.id)
    .maybeSingle()

  return NextResponse.json({ data: settings ?? DEFAULTS })
}

// ─── PATCH /api/settings ─────────────────────────────────────────────────────
// Upserts user settings. Inserts on first save, updates thereafter.
// Body: { currency?, number_format? }
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

  const VALID_FORMATS   = ['thousands', 'full', 'smart']
  const VALID_CURRENCIES = ['AUD', 'NZD', 'USD', 'GBP', 'SGD']

  const updates: Record<string, unknown> = { user_id: session.user.id, updated_at: new Date().toISOString() }

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

  // Use admin client for upsert (user_settings RLS allows own row, but admin is safer for upsert)
  const admin = createAdminClient()
  const { data: settings, error } = await admin
    .from('user_settings')
    .upsert(updates, { onConflict: 'user_id' })
    .select('currency, number_format')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: settings })
}
