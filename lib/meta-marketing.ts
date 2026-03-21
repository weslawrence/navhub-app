/**
 * Meta (Facebook/Instagram) marketing helpers — Graph API + Ads API
 * SERVER-SIDE ONLY — never import in client components.
 */

const GRAPH_BASE = 'https://graph.facebook.com/v19.0'

export interface MetaTokens {
  access_token: string
  token_type:   string
  expires_in?:  number
}

export interface MetaPage {
  id:            string
  name:          string
  category:      string
  access_token?: string
}

export interface MetaAdAccount {
  id:       string
  name:     string
  currency: string
}

export interface MetaPageInsightResult {
  reach:         number
  impressions:   number
  engaged_users: number
  page_views:    number
  followers:     number
}

export interface MetaAdInsightResult {
  spend:       number
  impressions: number
  reach:       number
  clicks:      number
  ctr:         number
  conversions: number
}

export async function exchangeMetaCode(code: string): Promise<MetaTokens> {
  const url = `${GRAPH_BASE}/oauth/access_token?` + new URLSearchParams({
    client_id:     process.env.META_APP_ID ?? '',
    client_secret: process.env.META_APP_SECRET ?? '',
    redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/marketing/meta/callback`,
    code,
  })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta token exchange failed: ${await res.text()}`)
  return res.json() as Promise<MetaTokens>
}

export async function getLongLivedToken(shortLivedToken: string): Promise<MetaTokens> {
  const url = `${GRAPH_BASE}/oauth/access_token?` + new URLSearchParams({
    grant_type:        'fb_exchange_token',
    client_id:         process.env.META_APP_ID ?? '',
    client_secret:     process.env.META_APP_SECRET ?? '',
    fb_exchange_token: shortLivedToken,
  })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta long-lived token exchange failed: ${await res.text()}`)
  return res.json() as Promise<MetaTokens>
}

export async function getMetaPages(accessToken: string): Promise<MetaPage[]> {
  const url = `${GRAPH_BASE}/me/accounts?access_token=${accessToken}&fields=id,name,category,access_token`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json() as { data?: MetaPage[] }
  return data.data ?? []
}

export async function getAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const url = `${GRAPH_BASE}/me/adaccounts?access_token=${accessToken}&fields=id,name,currency`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json() as { data?: MetaAdAccount[] }
  return data.data ?? []
}

export async function fetchMetaPageInsights(
  pageAccessToken: string,
  pageId:          string,
  since:           number,
  until:           number,
): Promise<MetaPageInsightResult> {
  const url = `${GRAPH_BASE}/${pageId}/insights?` + new URLSearchParams({
    metric:       'page_fans,page_impressions,page_reach,page_engaged_users,page_views_total',
    period:       'month',
    since:        String(since),
    until:        String(until),
    access_token: pageAccessToken,
  })
  const res = await fetch(url)
  if (!res.ok) return { reach: 0, impressions: 0, engaged_users: 0, page_views: 0, followers: 0 }
  const data = await res.json() as {
    data?: { name: string; values: { value: number }[] }[]
  }
  const metrics: Record<string, number> = {}
  for (const item of data.data ?? []) {
    metrics[item.name] = item.values?.[0]?.value ?? 0
  }
  return {
    followers:     metrics['page_fans']          ?? 0,
    impressions:   metrics['page_impressions']   ?? 0,
    reach:         metrics['page_reach']         ?? 0,
    engaged_users: metrics['page_engaged_users'] ?? 0,
    page_views:    metrics['page_views_total']   ?? 0,
  }
}

export async function fetchMetaAdInsights(
  accessToken: string,
  adAccountId: string,
  startDate:   string,
  endDate:     string,
): Promise<MetaAdInsightResult> {
  const timeRange = JSON.stringify({ since: startDate, until: endDate })
  const url = `${GRAPH_BASE}/${adAccountId}/insights?` + new URLSearchParams({
    fields:       'spend,impressions,reach,clicks,ctr',
    time_range:   timeRange,
    access_token: accessToken,
  })
  const res = await fetch(url)
  if (!res.ok) return { spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: 0, conversions: 0 }
  const data = await res.json() as {
    data?: { spend: string; impressions: string; reach: string; clicks: string; ctr: string }[]
  }
  const row = data.data?.[0]
  return {
    spend:       Number(row?.spend       ?? 0),
    impressions: Number(row?.impressions ?? 0),
    reach:       Number(row?.reach       ?? 0),
    clicks:      Number(row?.clicks      ?? 0),
    ctr:         Number(row?.ctr         ?? 0),
    conversions: 0,
  }
}
