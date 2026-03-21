/**
 * POST /api/marketing/linkedin/sync
 * Syncs LinkedIn share statistics + follower count for a company.
 * Body: { company_id?: string, period?: string }
 * Also callable by cron (Authorization: Bearer {CRON_SECRET}).
 */
import { NextRequest, NextResponse }    from 'next/server'
import { createClient }                 from '@/lib/supabase/server'
import { createAdminClient }            from '@/lib/supabase/admin'
import { cookies }                      from 'next/headers'
import { decrypt }                      from '@/lib/encryption'
import {
  refreshLinkedInToken,
  fetchLinkedInOrgFollowers,
  fetchLinkedInShareStatistics,
} from '@/lib/linkedin-marketing'

interface StoredTokens { access_token: string; refresh_token?: string; scope?: string }

async function getValidLinkedInToken(connection: {
  id: string
  credentials_encrypted: string | null
  access_token_expires_at: string | null
}): Promise<string | null> {
  if (!connection.credentials_encrypted) return null
  const admin = createAdminClient()
  let creds: StoredTokens
  try { creds = JSON.parse(decrypt(connection.credentials_encrypted)) as StoredTokens } catch { return null }

  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at) : null
  if (expiresAt && expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    if (!creds.refresh_token) return null
    try {
      const fresh = await refreshLinkedInToken(creds.refresh_token)
      const newCreds: StoredTokens = {
        access_token:  fresh.access_token,
        refresh_token: fresh.refresh_token ?? creds.refresh_token,
        scope:         fresh.scope ?? creds.scope,
      }
      const newExpiry = new Date(Date.now() + (fresh.expires_in ?? 5183944) * 1000).toISOString()
      const { encrypt } = await import('@/lib/encryption')
      await admin.from('marketing_connections').update({
        credentials_encrypted:   encrypt(JSON.stringify(newCreds)),
        access_token_expires_at: newExpiry,
      }).eq('id', connection.id)
      creds = newCreds
    } catch { return null }
  }

  return creds.access_token
}

function getPeriodRange(period?: string): { startTime: number; endTime: number; periodStart: string; periodEnd: string } {
  if (period) {
    const [y, m] = period.split('-').map(Number)
    const start  = new Date(y, m - 1, 1)
    const end    = new Date(y, m, 0)
    return {
      startTime:   start.getTime(),
      endTime:     end.getTime(),
      periodStart: start.toISOString().slice(0, 10),
      periodEnd:   end.toISOString().slice(0, 10),
    }
  }
  const end   = new Date()
  const start = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  return {
    startTime:   start.getTime(),
    endTime:     end.getTime(),
    periodStart: start.toISOString().slice(0, 10),
    periodEnd:   end.toISOString().slice(0, 10),
  }
}

export async function POST(req: NextRequest) {
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

  const { startTime, endTime, periodStart, periodEnd } = getPeriodRange(period)
  const periodKey = period ?? periodStart.slice(0, 7)
  const pStart    = `${periodKey}-01`

  const admin = createAdminClient()
  const errors: string[] = []
  let synced = 0

  let query = admin
    .from('marketing_connections')
    .select('id, company_id, credentials_encrypted, access_token_expires_at, config')
    .eq('group_id', groupId)
    .eq('platform', 'linkedin')
    .eq('is_active', true)
  if (companyId) query = query.eq('company_id', companyId)
  const { data: connections } = await query

  for (const conn of connections ?? []) {
    const accessToken = await getValidLinkedInToken(conn as { id: string; credentials_encrypted: string | null; access_token_expires_at: string | null })
    if (!accessToken) { errors.push(`linkedin/${conn.company_id ?? 'group'}: no valid token`); continue }

    const config  = (conn.config ?? {}) as Record<string, unknown>
    const orgId   = config.org_id as string | undefined
    if (!orgId) { errors.push(`linkedin/${conn.company_id ?? 'group'}: no org_id`); continue }

    try {
      const [stats, followers] = await Promise.all([
        fetchLinkedInShareStatistics(accessToken, orgId, startTime, endTime),
        fetchLinkedInOrgFollowers(accessToken, orgId),
      ])

      const rows = [
        { metric_key: 'impressions',     value: stats.impressions     },
        { metric_key: 'clicks',          value: stats.clicks          },
        { metric_key: 'engagement_rate', value: stats.engagement_rate },
        { metric_key: 'shares',          value: stats.shares          },
        { metric_key: 'followers',       value: followers             },
      ]
      for (const row of rows) {
        await admin.from('marketing_snapshots').upsert({
          group_id:     groupId,
          company_id:   conn.company_id,
          platform:     'linkedin',
          metric_key:   row.metric_key,
          value_number: row.value,
          period_start: pStart,
          period_end:   periodEnd,
          period_type:  'monthly',
          source:       'api',
        }, { onConflict: 'group_id,company_id,platform,metric_key,period_start,period_type' })
      }

      await admin.from('marketing_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id)
      synced++
    } catch (err) { errors.push(`linkedin/${conn.company_id ?? 'group'}: ${String(err)}`) }
  }

  return NextResponse.json({ synced, errors })
}
