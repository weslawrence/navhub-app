/**
 * LinkedIn marketing helpers — Organization stats + Share statistics
 * SERVER-SIDE ONLY — never import in client components.
 */

const LI_BASE = 'https://api.linkedin.com/v2'

export interface LinkedInTokens {
  access_token:   string
  refresh_token?: string
  expires_in:     number
  scope?:         string
}

export interface LinkedInOrganization {
  id:   string
  name: string
  urn:  string
}

export interface LinkedInShareStats {
  impressions:     number
  clicks:          number
  engagement_rate: number
  shares:          number
  followers:       number
}

export async function exchangeLinkedInCode(code: string): Promise<LinkedInTokens> {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      client_id:     process.env.LINKEDIN_CLIENT_ID ?? '',
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
      redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/marketing/linkedin/callback`,
    }),
  })
  if (!res.ok) throw new Error(`LinkedIn token exchange failed: ${await res.text()}`)
  return res.json() as Promise<LinkedInTokens>
}

export async function refreshLinkedInToken(refreshToken: string): Promise<LinkedInTokens> {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     process.env.LINKEDIN_CLIENT_ID ?? '',
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
    }),
  })
  if (!res.ok) throw new Error(`LinkedIn token refresh failed: ${await res.text()}`)
  return res.json() as Promise<LinkedInTokens>
}

export async function getLinkedInOrganizations(accessToken: string): Promise<LinkedInOrganization[]> {
  const res = await fetch(
    `${LI_BASE}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationalTarget~(id,localizedName)))`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return []
  const data = await res.json() as {
    elements?: { organizationalTarget: { id: number | string; localizedName: string } }[]
  }
  return (data.elements ?? []).map(el => ({
    id:   String(el.organizationalTarget.id),
    name: el.organizationalTarget.localizedName,
    urn:  `urn:li:organization:${el.organizationalTarget.id}`,
  }))
}

export async function fetchLinkedInOrgFollowers(accessToken: string, orgId: string): Promise<number> {
  const urn = encodeURIComponent(`urn:li:organization:${orgId}`)
  const res = await fetch(
    `${LI_BASE}/networkSizes/${urn}?edgeType=CompanyFollowedByMember`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!res.ok) return 0
  const data = await res.json() as { firstDegreeSize?: number }
  return data.firstDegreeSize ?? 0
}

export async function fetchLinkedInShareStatistics(
  accessToken: string,
  orgId:       string,
  startTime:   number,
  endTime:     number,
): Promise<LinkedInShareStats> {
  const params = new URLSearchParams({
    q:                                          'organizationalEntity',
    organizationalEntity:                       `urn:li:organization:${orgId}`,
    'timeIntervals.timeGranularityType':         'MONTH',
    'timeIntervals.timeRange.start':             String(startTime),
    'timeIntervals.timeRange.end':               String(endTime),
  })
  const res = await fetch(`${LI_BASE}/organizationalEntityShareStatistics?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return { impressions: 0, clicks: 0, engagement_rate: 0, shares: 0, followers: 0 }
  const data = await res.json() as {
    elements?: {
      totalShareStatistics: {
        impressionCount: number
        clickCount:      number
        engagement:      number
        shareCount:      number
      }
    }[]
  }
  const stats = data.elements?.[0]?.totalShareStatistics
  return {
    impressions:     stats?.impressionCount ?? 0,
    clicks:          stats?.clickCount      ?? 0,
    engagement_rate: stats?.engagement      ?? 0,
    shares:          stats?.shareCount      ?? 0,
    followers:       0, // fetched separately via fetchLinkedInOrgFollowers
  }
}
