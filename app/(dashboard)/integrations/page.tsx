import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge }       from '@/components/ui/badge'
import { Plug, FileSpreadsheet } from 'lucide-react'
import SyncButton   from '@/components/integrations/SyncButton'
import ConnectXero  from '@/components/integrations/ConnectXero'
import ExcelUpload  from '@/components/excel/ExcelUpload'
  import type { XeroConnection, Company } from '@/lib/types'

export default async function IntegrationsPage() {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  if (!activeGroupId) {
    return (
      <div className="text-muted-foreground text-sm p-4">No active group selected.</div>
    )
  }

  // ── Load companies + divisions for this group ────────────────────────────

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('group_id', activeGroupId)
    .eq('is_active', true)
    .order('name')

  const companyList = (companies ?? []) as Pick<Company, 'id' | 'name'>[]
  const companyIds  = companyList.map(c => c.id)

  // Load divisions with their company name for the ConnectXero dropdown
  const { data: divisionsRaw } = companyIds.length > 0
    ? await supabase
        .from('divisions')
        .select('id, name, company_id, companies:companies(name)')
        .in('company_id', companyIds)
        .eq('is_active', true)
        .order('name')
    : { data: [] }

  const divisionList = (divisionsRaw ?? []).map((d: {
    id: string; name: string; company_id: string;
    companies: { name: string }[] | null
  }) => ({
    id:           d.id,
    name:         d.name,
    company_id:   d.company_id,
    company_name: d.companies?.[0]?.name ?? '',
  }))

  // ── Load Xero connections ─────────────────────────────────────────────────

  const { data: xeroConnections } = companyIds.length > 0
    ? await supabase
        .from('xero_connections')
        .select('*, company:companies(name), division:divisions(name)')
        .or(`company_id.in.(${companyIds.join(',')}),division_id.in.(${divisionList.map(d => d.id).join(',') || 'null'})`)
    : { data: [] }

  // ── Load recent sync logs ─────────────────────────────────────────────────

  const { data: syncLogs } = companyIds.length > 0
    ? await supabase
        .from('sync_logs')
        .select('*')
        .in('company_id', companyIds)
        .order('created_at', { ascending: false })
        .limit(10)
    : { data: [] }

  const connected = Boolean(xeroConnections && xeroConnections.length > 0)

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

        {/* Existing connections */}
        {connected && (
          <div className="space-y-3">
            {(xeroConnections as (XeroConnection & {
              company?:  { name: string }
              division?: { name: string }
            })[]).map(conn => (
              <Card key={conn.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">
                        {conn.company?.name ?? conn.division?.name ?? 'Unknown entity'}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5 font-mono">
                        {conn.xero_tenant_id}
                      </CardDescription>
                    </div>
                    <Badge variant="success">Connected</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <SyncButton
                    connectionId={conn.id}
                    lastSyncedAt={conn.connected_at}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add new connection */}
        <ConnectXero
          companies={companyList}
          divisions={divisionList}
        />
      </section>

      {/* ── Excel Upload ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" /> Excel Upload
        </h2>
        <ExcelUpload
          companies={companyList}
          divisions={divisionList.map(d => ({ id: d.id, name: d.name }))}
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
                    <td className="px-4 py-2 capitalize">{log.source}</td>
                    <td className="px-4 py-2">
                      <Badge variant={log.status === 'success' ? 'success' : 'error'}>
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs max-w-xs truncate">
                      {log.message ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
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
