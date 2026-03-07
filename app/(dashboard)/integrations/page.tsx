import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plug, FileSpreadsheet, RefreshCw } from 'lucide-react'
import ExcelUpload from '@/components/excel/ExcelUpload'
import type { XeroConnection, Company } from '@/lib/types'

export default async function IntegrationsPage() {
  const supabase    = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  if (!activeGroupId) {
    return (
      <div className="text-muted-foreground text-sm p-4">No active group selected.</div>
    )
  }

  // Load companies for this group
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('group_id', activeGroupId)
    .order('name')

  const companyIds = companies?.map((c: { id: string; name: string }) => c.id) ?? []

  // Load xero connections
  const { data: xeroConnections } = companyIds.length > 0
    ? await supabase
        .from('xero_connections')
        .select('*, company:companies(name), division:divisions(name)')
        .in('company_id', companyIds)
    : { data: [] }

  // Load recent sync logs
  const { data: syncLogs } = companyIds.length > 0
    ? await supabase
        .from('sync_logs')
        .select('*')
        .in('company_id', companyIds)
        .order('created_at', { ascending: false })
        .limit(10)
    : { data: [] }

  const connected = Boolean(
    xeroConnections && xeroConnections.length > 0
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Connect Xero or upload Excel files to sync financial data
        </p>
      </div>

      {/* ── Xero ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Plug className="h-5 w-5 text-primary" /> Xero
        </h2>

        {connected ? (
          <div className="space-y-3">
            {xeroConnections!.map((conn: XeroConnection & { company?: { name: string }; division?: { name: string } }) => (
              <Card key={conn.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">
                        {conn.company?.name ?? conn.division?.name ?? 'Unknown entity'}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Tenant: {conn.xero_tenant_id}
                      </CardDescription>
                    </div>
                    <Badge variant="success">Connected</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <form action={`/api/xero/sync/profit-loss`} method="POST">
                    <input type="hidden" name="connection_id" value={conn.id} />
                    <input type="hidden" name="period" value={new Date().toISOString().slice(0, 7)} />
                    <Button type="submit" variant="outline" size="sm">
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Sync P&L
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center h-36 text-muted-foreground">
              <Plug className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm mb-3">No Xero connections yet</p>
              {companies && companies.length > 0 ? (
                <a href={`/api/xero/connect?entity_type=company&entity_id=${companies[0].id}`}>
                  <Button size="sm">Connect Xero</Button>
                </a>
              ) : (
                <p className="text-xs text-center max-w-xs">
                  Add companies first, then connect Xero to each one
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── Excel Upload ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" /> Excel Upload
        </h2>
        <ExcelUpload
          companies={companies?.map((c: Pick<Company, 'id' | 'name'>) => ({ id: c.id, name: c.name })) ?? []}
        />
      </section>

      {/* ── Sync Logs ── */}
      {syncLogs && syncLogs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Sync History</h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Source</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Message</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Time</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="px-4 py-2">{log.source}</td>
                    <td className="px-4 py-2">
                      <Badge variant={log.status === 'success' ? 'success' : 'error'}>
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs max-w-xs truncate">
                      {log.message ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString('en-AU')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
