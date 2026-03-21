/**
 * GET /api/marketing/meta/callback?code=...&state=...
 * Handles Meta (Facebook) OAuth callback.
 * Exchanges short-lived code for long-lived token (60 days),
 * discovers Pages + Ad Accounts, upserts marketing_connections for 'meta' and 'meta_ads'.
 */
import { NextRequest, NextResponse }    from 'next/server'
import { createAdminClient }            from '@/lib/supabase/admin'
import { encrypt }                      from '@/lib/encryption'
import {
  exchangeMetaCode,
  getLongLivedToken,
  getMetaPages,
  getAdAccounts,
} from '@/lib/meta-marketing'

export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const error = req.nextUrl.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&error=meta_denied`)
  }

  let groupId = '', companyId: string | null = null
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as { group_id: string; company_id?: string }
    groupId   = decoded.group_id
    companyId = decoded.company_id ?? null
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&error=meta_state`)
  }

  const admin = createAdminClient()

  try {
    // Exchange code for short-lived token
    const shortLived  = await exchangeMetaCode(code)
    // Upgrade to long-lived token (60 days)
    const longLived   = await getLongLivedToken(shortLived.access_token)

    const accessToken = longLived.access_token
    // Meta long-lived tokens expire in ~60 days; expires_in is usually 5183944 seconds
    const expiresAt   = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
      : new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString()

    const encrypted = encrypt(JSON.stringify({ access_token: accessToken }))

    // Discover pages
    const pages      = await getMetaPages(accessToken)
    const firstPage  = pages[0]

    // Discover ad accounts
    const adAccounts    = await getAdAccounts(accessToken)
    const firstAdAccount = adAccounts[0]

    // Upsert meta (pages/organic) connection
    await admin.from('marketing_connections').upsert({
      group_id:                groupId,
      company_id:              companyId,
      platform:                'meta',
      credentials_encrypted:   encrypt(JSON.stringify({ access_token: firstPage?.access_token ?? accessToken })),
      config:                  firstPage ? { page_id: firstPage.id, page_name: firstPage.name, category: firstPage.category } : {},
      is_active:               true,
      access_token_expires_at: expiresAt,
      scope:                   null,
      external_account_id:     firstPage?.id ?? null,
      external_account_name:   firstPage?.name ?? null,
    }, { onConflict: 'group_id,company_id,platform' })

    // Upsert meta_ads connection (uses user-level long-lived token)
    await admin.from('marketing_connections').upsert({
      group_id:                groupId,
      company_id:              companyId,
      platform:                'meta_ads',
      credentials_encrypted:   encrypted,
      config:                  firstAdAccount ? { ad_account_id: firstAdAccount.id, ad_account_name: firstAdAccount.name, currency: firstAdAccount.currency } : {},
      is_active:               true,
      access_token_expires_at: expiresAt,
      scope:                   null,
      external_account_id:     firstAdAccount?.id ?? null,
      external_account_name:   firstAdAccount?.name ?? null,
    }, { onConflict: 'group_id,company_id,platform' })

  } catch (err) {
    console.error('Meta OAuth callback error:', err)
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&error=meta_failed`)
  }

  const redirect = companyId
    ? `${appUrl}/marketing/${companyId}?meta_connected=1`
    : `${appUrl}/settings?tab=integrations&meta_connected=1`

  return NextResponse.redirect(redirect)
}
