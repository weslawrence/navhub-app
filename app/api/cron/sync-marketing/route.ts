/**
 * GET /api/cron/sync-marketing
 * Nightly cron: syncs marketing metrics for all active connections across all groups.
 * Authenticated via: Authorization: Bearer {CRON_SECRET}
 * Delegates to each platform's sync route internally.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient }         from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Get all distinct group IDs that have active marketing connections
  const { data: connections } = await admin
    .from('marketing_connections')
    .select('group_id, company_id, platform')
    .eq('is_active', true)
    .in('platform', ['ga4', 'search_console', 'meta', 'meta_ads', 'linkedin'])

  if (!connections || connections.length === 0) {
    return NextResponse.json({ message: 'No active marketing connections', synced: 0, errors: [] })
  }

  // Group by group_id → unique company_ids per group using plain objects
  const groupMap: Record<string, (string | null)[]> = {}
  for (const conn of connections) {
    if (!groupMap[conn.group_id]) groupMap[conn.group_id] = []
    const companyId = (conn.company_id as string | null) ?? null
    if (!groupMap[conn.group_id].includes(companyId)) {
      groupMap[conn.group_id].push(companyId)
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.navhub.co'
  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${process.env.CRON_SECRET}`,
  }

  const errors: string[] = []
  let synced = 0
  const groupIds = Object.keys(groupMap)

  for (const groupId of groupIds) {
    const companyIds = groupMap[groupId]
    for (const companyId of companyIds) {
      const body = JSON.stringify({ group_id: groupId, company_id: companyId ?? undefined })

      const results = await Promise.allSettled([
        fetch(`${baseUrl}/api/marketing/google/sync`,   { method: 'POST', headers, body }),
        fetch(`${baseUrl}/api/marketing/meta/sync`,     { method: 'POST', headers, body }),
        fetch(`${baseUrl}/api/marketing/linkedin/sync`, { method: 'POST', headers, body }),
      ])

      for (const result of results) {
        if (result.status === 'fulfilled') {
          try {
            const json = await result.value.json() as { synced?: number; errors?: string[] }
            synced += json.synced ?? 0
            if (json.errors?.length) errors.push(...json.errors)
          } catch { /* ignore json parse errors */ }
        } else {
          errors.push(`Fetch failed for group ${groupId}: ${String(result.reason)}`)
        }
      }
    }
  }

  return NextResponse.json({ synced, errors, groups: groupIds.length })
}
