import { createAdminClient }        from '@/lib/supabase/admin'
import { encrypt }                   from '@/lib/encryption'
import { exchangeSharePointCode }    from '@/lib/sharepoint'
import { NextResponse }              from 'next/server'

/**
 * GET /api/integrations/sharepoint/callback
 * Handles the Microsoft OAuth2 callback, stores encrypted tokens.
 */
export async function GET(req: Request) {
  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const state  = url.searchParams.get('state')
  const error  = url.searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.navhub.co'

  if (error) {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&sharepoint_error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&sharepoint_error=missing_code`)
  }

  // Decode state
  let groupId: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString()) as { group_id: string }
    groupId = decoded.group_id
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&sharepoint_error=invalid_state`)
  }

  try {
    const tokens = await exchangeSharePointCode(code)

    const admin = createAdminClient()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Upsert connection (one per group for now)
    const { error: upsertError } = await admin
      .from('sharepoint_connections')
      .upsert({
        group_id:      groupId,
        access_token:  encrypt(tokens.access_token),
        refresh_token: encrypt(tokens.refresh_token),
        expires_at:    expiresAt,
        is_active:     true,
        folder_path:   'NavHub/Documents',
      }, {
        onConflict: 'group_id',
        ignoreDuplicates: false,
      })

    if (upsertError) {
      console.error('SharePoint connection upsert error:', upsertError)
      return NextResponse.redirect(`${appUrl}/settings?tab=integrations&sharepoint_error=db_error`)
    }

    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&sharepoint_connected=1`)
  } catch (err) {
    console.error('SharePoint callback error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.redirect(`${appUrl}/settings?tab=integrations&sharepoint_error=${encodeURIComponent(msg)}`)
  }
}
