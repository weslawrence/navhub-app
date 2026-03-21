/**
 * GET /api/marketing/linkedin/callback?code=...&state=...
 * Handles LinkedIn OAuth callback.
 * Exchanges code for tokens, discovers organizations,
 * upserts marketing_connections for 'linkedin'.
 */
import { NextRequest, NextResponse }    from 'next/server'
import { createAdminClient }            from '@/lib/supabase/admin'
import { encrypt }                      from '@/lib/encryption'
import {
  exchangeLinkedInCode,
  getLinkedInOrganizations,
} from '@/lib/linkedin-marketing'

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&error=linkedin_denied`)
  }

  let groupId = '', companyId: string | null = null
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as { group_id: string; company_id?: string }
    groupId   = decoded.group_id
    companyId = decoded.company_id ?? null
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&error=linkedin_state`)
  }

  const admin = createAdminClient()

  try {
    const tokens = await exchangeLinkedInCode(code)

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 5183944) * 1000).toISOString()
    const encrypted = encrypt(JSON.stringify({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope:         tokens.scope,
    }))

    // Discover organizations where user is admin
    const orgs    = await getLinkedInOrganizations(tokens.access_token)
    const firstOrg = orgs[0]

    await admin.from('marketing_connections').upsert({
      group_id:                groupId,
      company_id:              companyId,
      platform:                'linkedin',
      credentials_encrypted:   encrypted,
      config:                  firstOrg ? { org_id: firstOrg.id, org_urn: firstOrg.urn, org_name: firstOrg.name } : {},
      is_active:               true,
      access_token_expires_at: expiresAt,
      scope:                   tokens.scope ?? null,
      external_account_id:     firstOrg?.id ?? null,
      external_account_name:   firstOrg?.name ?? null,
    }, { onConflict: 'group_id,company_id,platform' })

  } catch (err) {
    console.error('LinkedIn OAuth callback error:', err)
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&error=linkedin_failed`)
  }

  const redirect = companyId
    ? `${appUrl}/marketing/${companyId}?linkedin_connected=1`
    : `${appUrl}/settings?tab=integrations&linkedin_connected=1`

  return NextResponse.redirect(redirect)
}
