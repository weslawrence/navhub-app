/**
 * POST /api/marketing/meta/sync
 * Syncs Meta page insights + ad insights for a company.
 * Body: { company_id?: string, period?: string }
 * Also callable by cron (Authorization: Bearer {CRON_SECRET}).
 */
import { NextRequest, NextResponse }    from 'next/server'
import { createClient }                 from '@/lib/supabase/server'
import { createAdminClient }            from '@/lib/supabase/admin'
import { cookies }                      from 'next/headers'
import { decrypt }                      from '@/lib/encryption'
import { fetchMetaPageInsights, fetchMetaAdInsights } from '@/lib/meta-marketing'

interface StoredTokens { access_token: string }

function getPeriodRange(period?: string): { startDate: string; endDate: string; since: number; until: number } {
  if (period) {
    const [y, m] = period.split('-').map(Number)
    const start  = new Date(y, m - 1, 1)
    const end    = new Date(y, m, 0)
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate:   end.toISOString().slice(0, 10),
      since:     Math.floor(start.getTime() / 1000),
      until:     Math.floor(end.getTime() / 1000),
    }
  }
  const end   = new Date()
  const start = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate:   end.toISOString().slice(0, 10),
    since:     Math.floor(start.getTime() / 1000),
    until:     Math.floor(end.getTime() / 1000),
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

  const { startDate, endDate, since, until } = getPeriodRange(period)
  const periodKey   = period ?? startDate.slice(0, 7)
  const periodStart = `${periodKey}-01`

  const admin = createAdminClient()
  const errors: string[] = []
  let synced = 0

  // Sync Meta page insights
  let metaQuery = admin
    .from('marketing_connections')
    .select('id, company_id, credentials_encrypted, config')
    .eq('group_id', groupId)
    .eq('platform', 'meta')
    .eq('is_active', true)
  if (companyId) metaQuery = metaQuery.eq('company_id', companyId)
  const { data: metaConns } = await metaQuery

  for (const conn of metaConns ?? []) {
    if (!conn.credentials_encrypted) continue
    let creds: StoredTokens
    try { creds = JSON.parse(decrypt(conn.credentials_encrypted)) as StoredTokens } catch { continue }
    const config   = (conn.config ?? {}) as Record<string, unknown>
    const pageId   = config.page_id as string | undefined
    if (!pageId) { errors.push(`meta/${conn.company_id ?? 'group'}: no page_id`); continue }

    try {
      const insights = await fetchMetaPageInsights(creds.access_token, pageId, since, until)
      const rows = [
        { metric_key: 'reach',         value: insights.reach         },
        { metric_key: 'impressions',   value: insights.impressions   },
        { metric_key: 'engaged_users', value: insights.engaged_users },
        { metric_key: 'page_views',    value: insights.page_views    },
        { metric_key: 'followers',     value: insights.followers     },
      ]
      for (const row of rows) {
        await admin.from('marketing_snapshots').upsert({
          group_id: groupId, company_id: conn.company_id, platform: 'meta',
          metric_key: row.metric_key, value_number: row.value,
          period_start: periodStart, period_end: endDate, period_type: 'monthly', source: 'api',
        }, { onConflict: 'group_id,company_id,platform,metric_key,period_start,period_type' })
      }
      await admin.from('marketing_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id)
      synced++
    } catch (err) { errors.push(`meta/${conn.company_id ?? 'group'}: ${String(err)}`) }
  }

  // Sync Meta Ads insights
  let adsQuery = admin
    .from('marketing_connections')
    .select('id, company_id, credentials_encrypted, config')
    .eq('group_id', groupId)
    .eq('platform', 'meta_ads')
    .eq('is_active', true)
  if (companyId) adsQuery = adsQuery.eq('company_id', companyId)
  const { data: adsConns } = await adsQuery

  for (const conn of adsConns ?? []) {
    if (!conn.credentials_encrypted) continue
    let creds: StoredTokens
    try { creds = JSON.parse(decrypt(conn.credentials_encrypted)) as StoredTokens } catch { continue }
    const config       = (conn.config ?? {}) as Record<string, unknown>
    const adAccountId  = config.ad_account_id as string | undefined
    if (!adAccountId) { errors.push(`meta_ads/${conn.company_id ?? 'group'}: no ad_account_id`); continue }

    try {
      const insights = await fetchMetaAdInsights(creds.access_token, adAccountId, startDate, endDate)
      const rows = [
        { metric_key: 'spend',       value: insights.spend       },
        { metric_key: 'impressions', value: insights.impressions },
        { metric_key: 'reach',       value: insights.reach       },
        { metric_key: 'clicks',      value: insights.clicks      },
        { metric_key: 'ctr',         value: insights.ctr         },
        { metric_key: 'conversions', value: insights.conversions },
      ]
      for (const row of rows) {
        await admin.from('marketing_snapshots').upsert({
          group_id: groupId, company_id: conn.company_id, platform: 'meta_ads',
          metric_key: row.metric_key, value_number: row.value,
          period_start: periodStart, period_end: endDate, period_type: 'monthly', source: 'api',
        }, { onConflict: 'group_id,company_id,platform,metric_key,period_start,period_type' })
      }
      await admin.from('marketing_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id)
      synced++
    } catch (err) { errors.push(`meta_ads/${conn.company_id ?? 'group'}: ${String(err)}`) }
  }

  return NextResponse.json({ synced, errors })
}
