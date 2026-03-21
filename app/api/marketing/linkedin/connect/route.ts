/**
 * GET /api/marketing/linkedin/connect?company_id=...
 * Redirects to LinkedIn OAuth2 authorization URL.
 * Scopes: r_organization_social, rw_organization_admin, r_ads_reporting
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'
import { cookies }                  from 'next/headers'

const SCOPES = 'r_organization_social rw_organization_admin r_ads_reporting'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const companyId = req.nextUrl.searchParams.get('company_id') ?? ''

  const state = Buffer.from(JSON.stringify({ group_id: activeGroupId, company_id: companyId })).toString('base64url')

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.LINKEDIN_CLIENT_ID ?? '',
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/marketing/linkedin/callback`,
    state,
    scope:         SCOPES,
  })

  return NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`)
}
