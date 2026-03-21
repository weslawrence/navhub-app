/**
 * POST /api/marketing/google/sync
 * Syncs GA4 + Search Console metrics for a company (or all companies in the group).
 * Body: { company_id?: string, period?: string }
 * Also callable by cron (Authorization: Bearer {CRON_SECRET}).
 */
import { NextRequest, NextResponse }    from 'next/server'
import { createClient }                 from '@/lib/supabase/server'
import { createAdminClient }            from '@/lib/supabase/admin'
import { cookies }                      from 'next/headers'
import { decrypt }                      from '@/lib/encryption'
import { refreshGoogleToken, fetchGA4Metrics, fetchSearchConsoleMetrics } from '@/lib/google-marketing'

interface StoredTokens {
  access_token:  string
  refresh_token?: string
  token_type:    string
}

async function getValidGoogleToken(connection: {
  id: string
  credentials_encrypted: string | null
  access_token_expires_at: string | null
}): Promise<{ access_token: string; refresh_token?: string } | null> {
  if (!connection.credentials_encrypted) return null

  const admin = createAdminClient()
  let creds: StoredTokens
  try {
    creds = JSON.parse(decrypt(connection.credentials_encrypted)) as StoredTokens
  } catch {
    return null
  }

  // Refresh if expiring within 5 minutes
  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at) : null
  if (expiresAt && expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    if (!creds.refresh_token) return null
    try {
      const fresh = await refreshGoogleToken(creds.refresh_token)
      const newCreds: StoredTokens = {
        access_token:  fresh.access_token,
        refresh_token: fresh.refresh_token ?? creds.refresh_token,
        token_type:    fresh.token_type,
      }
      const newExpiry = new Date(Date.now() + (fresh.expires_in ?? 3600) * 1000).toISOString()
      const { encrypt } = await import('@/lib/encryption')
      await admin.from('marketing_connections').update({
        credentials_encrypted:   encrypt(JSON.stringify(newCreds)),
        access_token_expires_at: newExpiry,
      }).eq('id', connection.id)
      creds = newCreds
    } catch {
      return null
    }
  }

  return { access_token: creds.access_token, refresh_token: creds.refresh_token }
}

function getPeriodRange(period?: string): { startDate: string; endDate: string } {
  if (period) {
    const [y, m] = period.split('-').map(Number)
    const start  = new Date(y, m - 1, 1)
    const end    = new Date(y, m, 0) // last day of month
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate:   end.toISOString().slice(0, 10),
    }
  }
  // Default: last 30 days
  const end   = new Date()
  const start = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate:   end.toISOString().slice(0, 10),
  }
}

export async function POST(req: NextRequest) {
  // Support cron auth
  const authHeader = req.headers.get('authorization')
  const isCron     = authHeader === `Bearer ${process.env.CRON_SECRET}`

  let activeGroupId: string | undefined
  if (!isCron) {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    const cookieStore = cookies()
    activeGroupId     = cookieStore.get('active_group_id')?.value
    if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })
  }

  const body      = await req.json().catch(() => ({})) as { company_id?: string; period?: string; group_id?: string }
  const companyId = body.company_id
  const period    = body.period
  const groupId   = isCron ? (body.group_id ?? '') : (activeGroupId ?? '')

  const { startDate, endDate } = getPeriodRange(period)
  const periodKey = period ?? startDate.slice(0, 7)
  const periodStart = `${periodKey}-01`
  const periodEnd   = endDate

  const admin = createAdminClient()

  // Fetch connections
  let query = admin
    .from('marketing_connections')
    .select('id, platform, company_id, credentials_encrypted, access_token_expires_at, config')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .in('platform', ['ga4', 'search_console'])

  if (companyId) query = query.eq('company_id', companyId)

  const { data: connections } = await query
  if (!connections || connections.length === 0) {
    return NextResponse.json({ synced: 0, errors: [] })
  }

  const errors: string[] = []
  let synced = 0

  for (const conn of connections) {
    const tokens = await getValidGoogleToken(conn as { id: string; credentials_encrypted: string | null; access_token_expires_at: string | null })
    if (!tokens) {
      errors.push(`${conn.platform}/${conn.company_id ?? 'group'}: no valid token`)
      continue
    }

    const config = (conn.config ?? {}) as Record<string, unknown>

    try {
      if (conn.platform === 'ga4') {
        const propertyId = config.property_id as string | undefined
        if (!propertyId) {
          errors.push(`ga4/${conn.company_id ?? 'group'}: no property_id configured`)
          continue
        }
        const metrics = await fetchGA4Metrics(tokens.access_token, propertyId, startDate, endDate)
        const rows = [
          { metric_key: 'sessions',                value: metrics.sessions               },
          { metric_key: 'totalUsers',              value: metrics.totalUsers             },
          { metric_key: 'newUsers',                value: metrics.newUsers               },
          { metric_key: 'bounceRate',              value: metrics.bounceRate             },
          { metric_key: 'averageSessionDuration',  value: metrics.averageSessionDuration },
          { metric_key: 'conversions',             value: metrics.conversions            },
        ]
        for (const row of rows) {
          await admin.from('marketing_snapshots').upsert({
            group_id:     groupId,
            company_id:   conn.company_id,
            platform:     'ga4',
            metric_key:   row.metric_key,
            value_number: row.value,
            period_start: periodStart,
            period_end:   periodEnd,
            period_type:  'monthly',
            source:       'api',
          }, { onConflict: 'group_id,company_id,platform,metric_key,period_start,period_type' })
        }
        synced++
      } else if (conn.platform === 'search_console') {
        const siteUrl = config.site_url as string | undefined
        if (!siteUrl) {
          errors.push(`search_console/${conn.company_id ?? 'group'}: no site_url configured`)
          continue
        }
        const metrics = await fetchSearchConsoleMetrics(tokens.access_token, siteUrl, startDate, endDate)
        const rows = [
          { metric_key: 'clicks',      value: metrics.clicks      },
          { metric_key: 'impressions', value: metrics.impressions },
          { metric_key: 'ctr',         value: metrics.ctr         },
          { metric_key: 'position',    value: metrics.position    },
        ]
        for (const row of rows) {
          await admin.from('marketing_snapshots').upsert({
            group_id:     groupId,
            company_id:   conn.company_id,
            platform:     'search_console',
            metric_key:   row.metric_key,
            value_number: row.value,
            period_start: periodStart,
            period_end:   periodEnd,
            period_type:  'monthly',
            source:       'api',
          }, { onConflict: 'group_id,company_id,platform,metric_key,period_start,period_type' })
        }
        synced++
      }

      // Update last_synced_at
      await admin.from('marketing_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id)

    } catch (err) {
      errors.push(`${conn.platform}/${conn.company_id ?? 'group'}: ${String(err)}`)
    }
  }

  return NextResponse.json({ synced, errors })
}
