/**
 * GET /api/marketing/meta/connect?company_id=...
 * Redirects to Meta (Facebook) OAuth2 authorization URL.
 * Scopes: pages_read_engagement, pages_show_list, ads_read, read_insights
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'
import { cookies }                  from 'next/headers'

const SCOPES = [
  'pages_read_engagement',
  'pages_show_list',
  'ads_read',
  'read_insights',
  'business_management',
].join(',')

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
    client_id:     process.env.META_APP_ID ?? '',
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/marketing/meta/callback`,
    response_type: 'code',
    scope:         SCOPES,
    state,
  })

  return NextResponse.redirect(`https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`)
}
