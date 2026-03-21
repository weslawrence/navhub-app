/**
 * GET /api/marketing/google/connect?company_id=...
 * Redirects to Google OAuth2 authorization URL.
 * Scopes: GA4 Data API read + Search Console read + Analytics Admin read
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient }             from '@/lib/supabase/server'
import { cookies }                  from 'next/headers'

const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.manage.users.readonly',
].join(' ')

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
    client_id:     process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/marketing/google/callback`,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
    state,
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}
