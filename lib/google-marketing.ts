/**
 * Google Marketing helpers — GA4 Data API + Search Console API
 * SERVER-SIDE ONLY — never import in client components.
 */

export interface GoogleTokens {
  access_token:   string
  refresh_token?: string
  expires_in:     number
  token_type:     string
  scope:          string
}

export interface GA4Property {
  id:         string
  name:       string
  websiteUrl: string
}

export interface GA4MetricResult {
  sessions:               number
  totalUsers:             number
  newUsers:               number
  bounceRate:             number
  averageSessionDuration: number
  conversions:            number
}

export interface SearchConsoleProperty {
  siteUrl:         string
  permissionLevel: string
}

export interface SearchConsoleMetricResult {
  clicks:      number
  impressions: number
  ctr:         number
  position:    number
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GA4_BASE  = 'https://analyticsdata.googleapis.com/v1beta'
const SC_BASE   = 'https://searchconsole.googleapis.com/webmasters/v3'

export async function exchangeGoogleCode(code: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/marketing/google/callback`,
      grant_type:    'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`)
  return res.json() as Promise<GoogleTokens>
}

export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`)
  return res.json() as Promise<GoogleTokens>
}

export async function getGA4Properties(accessToken: string): Promise<GA4Property[]> {
  const res = await fetch(
    'https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:accounts/-',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return []
  const data = await res.json() as {
    properties?: { name: string; displayName: string; websiteUri?: string }[]
  }
  return (data.properties ?? []).map(p => ({
    id:         p.name.replace('properties/', ''),
    name:       p.displayName,
    websiteUrl: p.websiteUri ?? '',
  }))
}

export async function fetchGA4Metrics(
  accessToken: string,
  propertyId:  string,
  startDate:   string,
  endDate:     string,
): Promise<GA4MetricResult> {
  const res = await fetch(`${GA4_BASE}/properties/${propertyId}:runReport`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'newUsers' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'conversions' },
      ],
    }),
  })
  if (!res.ok) throw new Error(`GA4 runReport failed: ${await res.text()}`)
  const data = await res.json() as {
    rows?:   { metricValues: { value: string }[] }[]
    totals?: { metricValues: { value: string }[] }[]
  }
  const values = (data.totals?.[0]?.metricValues ?? data.rows?.[0]?.metricValues ?? []).map(v =>
    Number(v.value) || 0
  )
  return {
    sessions:               values[0] ?? 0,
    totalUsers:             values[1] ?? 0,
    newUsers:               values[2] ?? 0,
    bounceRate:             values[3] ?? 0,
    averageSessionDuration: values[4] ?? 0,
    conversions:            values[5] ?? 0,
  }
}

export async function getSearchConsoleProperties(accessToken: string): Promise<SearchConsoleProperty[]> {
  const res = await fetch(`${SC_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  const data = await res.json() as {
    siteEntry?: { siteUrl: string; permissionLevel: string }[]
  }
  return (data.siteEntry ?? []).map(s => ({
    siteUrl:         s.siteUrl,
    permissionLevel: s.permissionLevel,
  }))
}

export async function fetchSearchConsoleMetrics(
  accessToken: string,
  siteUrl:     string,
  startDate:   string,
  endDate:     string,
): Promise<SearchConsoleMetricResult> {
  const encodedUrl = encodeURIComponent(siteUrl)
  const res = await fetch(`${SC_BASE}/sites/${encodedUrl}/searchAnalytics/query`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ startDate, endDate, dimensions: [], rowLimit: 1 }),
  })
  if (!res.ok) throw new Error(`Search Console query failed: ${await res.text()}`)
  const data = await res.json() as {
    rows?: { clicks: number; impressions: number; ctr: number; position: number }[]
  }
  const row = data.rows?.[0]
  return {
    clicks:      row?.clicks      ?? 0,
    impressions: row?.impressions ?? 0,
    ctr:         row?.ctr         ?? 0,
    position:    row?.position    ?? 0,
  }
}
