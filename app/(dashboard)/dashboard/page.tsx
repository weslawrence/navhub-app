import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, TrendingUp, Plug, RefreshCw } from 'lucide-react'
import type { Group } from '@/lib/types'

export default async function DashboardPage() {
  const supabase  = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  // Load active group details
  const { data: group } = activeGroupId
    ? await supabase.from('groups').select('*').eq('id', activeGroupId).single()
    : { data: null }

  // Load company count for active group
  const { count: companyCount } = activeGroupId
    ? await supabase
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', activeGroupId)
    : { count: 0 }

  // Load connection count
  const { count: connectionCount } = activeGroupId
    ? await supabase
        .from('xero_connections')
        .select('id', { count: 'exact', head: true })
        .in(
          'company_id',
          (await supabase.from('companies').select('id').eq('group_id', activeGroupId ?? '')).data?.map((c) => c.id) ?? []
        )
    : { count: 0 }

  const activeGroup = group as Group | null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {activeGroup?.name ?? 'Dashboard'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Financial performance overview
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Companies
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{companyCount ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Integrations
            </CardTitle>
            <Plug className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{connectionCount ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reports Synced
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">—</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last Sync
            </CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">—</p>
          </CardContent>
        </Card>
      </div>

      {/* Placeholder for charts */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Connect Xero or upload Excel data to see financial charts
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
