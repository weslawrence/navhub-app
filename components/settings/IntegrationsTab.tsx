'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plug, ChevronDown, RefreshCw, Check } from 'lucide-react'
import { Button }    from '@/components/ui/button'
import { Badge }     from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import ConnectXero   from '@/components/integrations/ConnectXero'
import SyncButton    from '@/components/integrations/SyncButton'

interface CompanyOption  { id: string; name: string }
interface DivisionOption { id: string; name: string; company_id: string; company_name: string }
interface XeroConn {
  id:             string
  company_id:     string | null
  division_id:    string | null
  xero_tenant_id: string
  connected_at:   string
  company?:       { name: string }
  division?:      { name: string }
}

export default function IntegrationsTab() {
  const [companies,    setCompanies]    = useState<CompanyOption[]>([])
  const [divisions,    setDivisions]    = useState<DivisionOption[]>([])
  const [connections,  setConnections]  = useState<XeroConn[]>([])
  const [loading,      setLoading]      = useState(true)
  const [linkSaving,   setLinkSaving]   = useState<string | null>(null)
  const [linkToast,    setLinkToast]    = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, xRes] = await Promise.all([
        fetch('/api/companies?include_inactive=false'),
        fetch('/api/xero/connections'),
      ])
      const cJson = await cRes.json()
      const xJson = await xRes.json()

      const companyList: CompanyOption[] = cJson.data ?? []
      setCompanies(companyList)

      // Load divisions for all companies
      if (companyList.length > 0) {
        const divResponses = await Promise.all(
          companyList.map(c => fetch(`/api/divisions?company_id=${c.id}`).then(r => r.json()))
        )
        const divs: DivisionOption[] = []
        companyList.forEach((c, i) => {
          const rows = divResponses[i]?.data ?? []
          rows.forEach((d: { id: string; name: string; company_id: string }) => {
            divs.push({ ...d, company_name: c.name })
          })
        })
        setDivisions(divs)
      }

      setConnections(xJson.data ?? [])
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Auto-clear link toasts
  useEffect(() => {
    const ids = Object.keys(linkToast)
    if (ids.length === 0) return
    const t = setTimeout(() => setLinkToast({}), 3000)
    return () => clearTimeout(t)
  }, [linkToast])

  async function handleLinkChange(connectionId: string, value: string) {
    setLinkSaving(connectionId)
    try {
      let body: Record<string, string | null>
      if (!value) {
        body = { entity_type: 'company', entity_id: null }
      } else {
        const [type, id] = value.split('::')
        body = { entity_type: type, entity_id: id }
      }
      const res  = await fetch(`/api/xero/connections/${connectionId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to update')

      // Update local state
      setConnections(cs => cs.map(c => {
        if (c.id !== connectionId) return c
        if (!value) return { ...c, company_id: null, division_id: null, company: undefined, division: undefined }
        const [type, id] = value.split('::')
        if (type === 'company') {
          const co = companies.find(x => x.id === id)
          return { ...c, company_id: id, division_id: null, company: co ? { name: co.name } : undefined, division: undefined }
        } else {
          const div = divisions.find(x => x.id === id)
          return { ...c, company_id: null, division_id: id, division: div ? { name: div.name } : undefined, company: undefined }
        }
      }))
      setLinkToast(t => ({ ...t, [connectionId]: 'Linked' }))
    } catch (err) {
      setLinkToast(t => ({ ...t, [connectionId]: err instanceof Error ? err.message : 'Failed' }))
    } finally {
      setLinkSaving(null)
    }
  }

  function currentEntityValue(conn: XeroConn): string {
    if (conn.company_id)  return `company::${conn.company_id}`
    if (conn.division_id) return `division::${conn.division_id}`
    return ''
  }

  const divisionList = divisions.map(d => ({ id: d.id, name: d.name, company_name: d.company_name }))

  return (
    <div className="space-y-6">

      {/* ── Xero Connections ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" /> Xero Connections
          </h2>
          <button
            type="button"
            onClick={() => void load()}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : connections.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No Xero connections yet. Connect one below.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {connections.map(conn => (
              <Card key={conn.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-sm text-foreground">
                        {conn.company?.name ?? conn.division?.name ?? 'Unlinked connection'}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5 font-mono truncate">
                        {conn.xero_tenant_id}
                      </CardDescription>
                    </div>
                    <Badge variant="success">Connected</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">

                  {/* Link to entity */}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Linked to</p>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <select
                          value={currentEntityValue(conn)}
                          disabled={linkSaving === conn.id}
                          onChange={e => void handleLinkChange(conn.id, e.target.value)}
                          className="appearance-none h-8 w-full rounded-md border border-input bg-background px-2 pr-7 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                        >
                          <option value="">— Unlinked —</option>
                          {companies.length > 0 && (
                            <optgroup label="Companies">
                              {companies.map(c => (
                                <option key={c.id} value={`company::${c.id}`}>{c.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {divisions.length > 0 && (
                            <optgroup label="Divisions">
                              {divisions.map(d => (
                                <option key={d.id} value={`division::${d.id}`}>
                                  {d.name} ({d.company_name})
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-1.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      {linkSaving === conn.id && (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      )}
                      {linkToast[conn.id] === 'Linked' && (
                        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Linked
                        </span>
                      )}
                      {linkToast[conn.id] && linkToast[conn.id] !== 'Linked' && (
                        <span className="text-xs text-destructive">{linkToast[conn.id]}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Connected {new Date(conn.connected_at).toLocaleDateString('en-AU')}
                    </p>
                  </div>

                  <SyncButton connectionId={conn.id} lastSyncedAt={conn.connected_at} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add new connection */}
        {!loading && (
          <ConnectXero companies={companies} divisions={divisionList} />
        )}
      </div>

    </div>
  )
}
