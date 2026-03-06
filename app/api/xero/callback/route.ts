import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeXeroCode, getXeroConnections } from '@/lib/xero'
import type { EntityType } from '@/lib/types'

interface StatePayload {
  entity_type: EntityType
  entity_id:   string
  user_id:     string
}

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // ── Handle Xero OAuth errors ──────────────────────────────
  if (error) {
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(error)}`, request.url)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/integrations?error=missing_code_or_state', request.url)
    )
  }

  // ── Auth check ────────────────────────────────────────────
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // ── Decode state ──────────────────────────────────────────
  let statePayload: StatePayload
  try {
    statePayload = JSON.parse(Buffer.from(state, 'base64url').toString())
  } catch {
    return NextResponse.redirect(
      new URL('/integrations?error=invalid_state', request.url)
    )
  }

  // Verify state matches current user
  if (statePayload.user_id !== session.user.id) {
    return NextResponse.redirect(
      new URL('/integrations?error=state_mismatch', request.url)
    )
  }

  // ── Exchange code for tokens ──────────────────────────────
  let tokens: Awaited<ReturnType<typeof exchangeXeroCode>>
  try {
    tokens = await exchangeXeroCode(code)
  } catch (err) {
    console.error('Xero token exchange error:', err)
    return NextResponse.redirect(
      new URL('/integrations?error=token_exchange_failed', request.url)
    )
  }

  // ── Get tenant connections ────────────────────────────────
  let tenants: Awaited<ReturnType<typeof getXeroConnections>>
  try {
    tenants = await getXeroConnections(tokens.access_token)
  } catch (err) {
    console.error('Xero connections fetch error:', err)
    return NextResponse.redirect(
      new URL('/integrations?error=connections_fetch_failed', request.url)
    )
  }

  if (!tenants || tenants.length === 0) {
    return NextResponse.redirect(
      new URL('/integrations?error=no_tenants', request.url)
    )
  }

  // Use the first tenant (most common case — single-org Xero)
  const tenant = tenants[0]

  // ── Store tokens in xero_connections ─────────────────────
  const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const connectionRecord = {
    xero_tenant_id: tenant.tenantId,
    access_token:   tokens.access_token,
    refresh_token:  tokens.refresh_token,
    token_expiry:   tokenExpiry,
    [statePayload.entity_type === 'company' ? 'company_id' : 'division_id']:
      statePayload.entity_id,
  }

  const { error: dbError } = await admin
    .from('xero_connections')
    .upsert(connectionRecord, {
      onConflict: statePayload.entity_type === 'company'
        ? 'company_id,xero_tenant_id'
        : 'division_id,xero_tenant_id',
      ignoreDuplicates: false,
    })

  if (dbError) {
    console.error('Xero connection save error:', dbError)
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(dbError.message)}`, request.url)
    )
  }

  return NextResponse.redirect(new URL('/integrations?connected=true', request.url))
}
