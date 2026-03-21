/**
 * GET /api/marketing/google/callback?code=...&state=...
 * Handles Google OAuth2 callback.
 * Exchanges code for tokens, discovers GA4 properties + Search Console sites,
 * upserts marketing_connections rows for ga4 and search_console.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'
import { encrypt }                   from '@/lib/encryption'
import {
  exchangeGoogleCode,
  getGA4Properties,
  getSearchConsoleProperties,
} from '@/lib/google-marketing'

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&error=google_denied`)
  }

  let groupId = '', companyId: string | null = null
  try {
    const decoded  = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as { group_id: string; company_id?: string }
    groupId    = decoded.group_id
    companyId  = decoded.company_id ?? null
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&error=google_state`)
  }

  const admin = createAdminClient()

  try {
    // Exchange code for tokens
    const tokens = await exchangeGoogleCode(code)

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()
    const encrypted = encrypt(JSON.stringify({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type:    tokens.token_type,
    }))

    // Discover GA4 properties
    const ga4Properties = await getGA4Properties(tokens.access_token)
    const firstGA4      = ga4Properties[0]

    // Discover Search Console properties
    const scProperties = await getSearchConsoleProperties(tokens.access_token)
    const firstSC      = scProperties[0]

    // Upsert ga4 connection
    await admin.from('marketing_connections').upsert({
      group_id:                groupId,
      company_id:              companyId,
      platform:                'ga4',
      credentials_encrypted:   encrypted,
      config:                  firstGA4 ? { property_id: firstGA4.id, property_name: firstGA4.name, website_url: firstGA4.websiteUrl } : {},
      is_active:               true,
      access_token_expires_at: expiresAt,
      scope:                   tokens.scope,
      external_account_id:     firstGA4?.id ?? null,
      external_account_name:   firstGA4?.name ?? null,
    }, { onConflict: 'group_id,company_id,platform' })

    // Upsert search_console connection (same credentials, different platform)
    await admin.from('marketing_connections').upsert({
      group_id:                groupId,
      company_id:              companyId,
      platform:                'search_console',
      credentials_encrypted:   encrypted,
      config:                  firstSC ? { site_url: firstSC.siteUrl, permission_level: firstSC.permissionLevel } : {},
      is_active:               true,
      access_token_expires_at: expiresAt,
      scope:                   tokens.scope,
      external_account_id:     firstSC?.siteUrl ?? null,
      external_account_name:   firstSC?.siteUrl ?? null,
    }, { onConflict: 'group_id,company_id,platform' })

  } catch (err) {
    console.error('Google OAuth callback error:', err)
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&error=google_failed`)
  }

  const redirect = companyId
    ? `${appUrl}/marketing/${companyId}?google_connected=1`
    : `${appUrl}/settings?tab=integrations&google_connected=1`

  return NextResponse.redirect(redirect)
}
