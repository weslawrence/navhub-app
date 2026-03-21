'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plug, ChevronDown, RefreshCw, Check, Link2, Link2Off, ExternalLink, Loader2 } from 'lucide-react'
import { Badge }     from '@/components/ui/badge'
import { Button }    from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import ConnectXero   from '@/components/integrations/ConnectXero'
import SyncButton    from '@/components/integrations/SyncButton'
import {
  MARKETING_PLATFORM_LABELS,
  MARKETING_PLATFORM_ICONS,
  type MarketingPlatform,
} from '@/lib/types'

const MARKETING_PLATFORM_GROUPS: { label: string; platforms: MarketingPlatform[] }[] = [
  { label: 'Web & Search',  platforms: ['ga4', 'search_console'] },
  { label: 'Social Media',  platforms: ['meta', 'linkedin'] },
  { label: 'Paid Ads',      platforms: ['google_ads', 'meta_ads'] },
  { label: 'Email & CRM',   platforms: ['mailchimp', 'hubspot', 'freshsales'] },
]

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

interface SharePointConnection {
  id:          string
  is_active:   boolean
  site_url:    string | null
  drive_id:    string | null
  folder_path: string | null
  expires_at:  string
}

export default function IntegrationsTab() {
  const [companies,    setCompanies]    = useState<CompanyOption[]>([])
  const [divisions,    setDivisions]    = useState<DivisionOption[]>([])
  const [connections,  setConnections]  = useState<XeroConn[]>([])
  const [loading,      setLoading]      = useState(true)
  const [linkSaving,   setLinkSaving]   = useState<string | null>(null)
  const [linkToast,    setLinkToast]    = useState<Record<string, string>>({})

  // SharePoint state
  const [spConnection,    setSpConnection]    = useState<SharePointConnection | null>(null)
  const [spDisconnecting, setSpDisconnecting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, xRes, spRes] = await Promise.all([
        fetch('/api/companies?include_inactive=false'),
        fetch('/api/xero/connections'),
        fetch('/api/integrations/sharepoint/status'),
      ])
      const cJson = await cRes.json()
      const xJson = await xRes.json()
      const spJson = spRes.ok ? await spRes.json() as { data: SharePointConnection | null } : { data: null }

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
      setSpConnection(spJson.data)
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

  async function disconnectSharePoint() {
    if (!confirm('Disconnect SharePoint? Existing synced files will remain in SharePoint but future syncs will stop.')) return
    setSpDisconnecting(true)
    try {
      await fetch('/api/integrations/sharepoint/status', { method: 'DELETE' })
      setSpConnection(null)
    } catch { /* silent */ } finally {
      setSpDisconnecting(false)
    }
  }

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

      {/* ── Marketing Platforms ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>📊</span> Marketing Platforms
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect marketing platforms to pull data automatically. Manual entry is always available from the{' '}
            <a href="/marketing" className="text-primary hover:underline">Marketing section</a>.
          </p>
        </div>

        <div className="space-y-4">
          {MARKETING_PLATFORM_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {group.label}
              </p>
              <div className="space-y-2">
                {group.platforms.map(platform => (
                  <div
                    key={platform}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{MARKETING_PLATFORM_ICONS[platform]}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {MARKETING_PLATFORM_LABELS[platform]}
                        </p>
                        <p className="text-xs text-muted-foreground">Manual entry supported</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
                      Coming soon
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SharePoint / OneDrive ────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>🗂️</span> SharePoint / OneDrive
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect Microsoft 365 to automatically sync documents to SharePoint or OneDrive.
          </p>
        </div>

        {spConnection ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-green-500" />
                  Connected
                </CardTitle>
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs">Active</Badge>
              </div>
              <CardDescription className="text-xs">
                Sync folder: <span className="font-mono text-foreground">{spConnection.folder_path ?? 'NavHub/Documents'}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {spConnection.site_url && (
                <a
                  href={spConnection.site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open SharePoint site
                </a>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950 gap-1.5"
                onClick={() => void disconnectSharePoint()}
                disabled={spDisconnecting}
              >
                {spDisconnecting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Link2Off className="h-3.5 w-3.5" />
                }
                Disconnect
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border border-border bg-card px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📎</span>
              <div>
                <p className="text-sm font-medium text-foreground">Microsoft SharePoint / OneDrive</p>
                <p className="text-xs text-muted-foreground">Not connected</p>
              </div>
            </div>
            <a href="/api/integrations/sharepoint/connect">
              <Button size="sm" className="gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Connect
              </Button>
            </a>
          </div>
        )}
      </div>

    </div>
  )
}
