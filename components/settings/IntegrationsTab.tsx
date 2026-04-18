'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plug, ChevronDown, RefreshCw, Check, Link2, Link2Off,
  ExternalLink, Loader2, Save,
} from 'lucide-react'
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

// ── Types ────────────────────────────────────────────────────────────────────

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

interface FolderMapping {
  id:              string
  folder_id:       string | null
  group_id:        string
  sharepoint_path: string
  auto_sync:       boolean
  document_folders?: { name: string } | null
}

interface MarketingConn {
  id:                    string
  platform:              MarketingPlatform
  company_id:            string | null
  config:                Record<string, unknown> | null
  is_active:             boolean
  last_synced_at:        string | null
  access_token_expires_at: string | null
  external_account_id:   string | null
  external_account_name: string | null
  scope:                 string | null
}

// Platforms that have real OAuth integration
const OAUTH_PLATFORMS: Partial<Record<MarketingPlatform, string>> = {
  ga4:            '/api/marketing/google/connect',
  search_console: '/api/marketing/google/connect',
  meta:           '/api/marketing/meta/connect',
  meta_ads:       '/api/marketing/meta/connect',
  linkedin:       '/api/marketing/linkedin/connect',
}

// Sync endpoints per platform group
const SYNC_ENDPOINTS: Partial<Record<MarketingPlatform, string>> = {
  ga4:            '/api/marketing/google/sync',
  search_console: '/api/marketing/google/sync',
  meta:           '/api/marketing/meta/sync',
  meta_ads:       '/api/marketing/meta/sync',
  linkedin:       '/api/marketing/linkedin/sync',
}

const MARKETING_PLATFORM_GROUPS: { label: string; platforms: MarketingPlatform[] }[] = [
  { label: 'Web & Search',  platforms: ['ga4', 'search_console'] },
  { label: 'Social Media',  platforms: ['meta', 'linkedin']      },
  { label: 'Paid Ads',      platforms: ['google_ads', 'meta_ads'] },
  { label: 'Email & CRM',   platforms: ['mailchimp', 'hubspot', 'freshsales'] },
]

// ── SharePoint site+folder picker (inline component) ────────────────────────

function SharePointSitePicker({
  currentSiteUrl,
  currentFolderPath,
  connectionId,
  onSaved,
}: {
  currentSiteUrl:    string | null
  currentFolderPath: string
  connectionId:      string
  onSaved:           () => void
}) {
  const [sites,      setSites]      = useState<Array<{ id: string; name: string; webUrl: string }>>([])
  const [loading,    setLoading]    = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')
  const [folderPath, setFolderPath] = useState(currentFolderPath)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)

  useEffect(() => {
    fetch('/api/integrations/sharepoint/sites')
      .then(r => r.json())
      .then((j: { sites?: Array<{ id: string; name: string; webUrl: string }> }) => {
        const list = j.sites ?? []
        setSites(list)
        const current = list.find(s => s.webUrl === currentSiteUrl)
        if (current) setSelectedId(current.id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [currentSiteUrl])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const site = sites.find(s => s.id === selectedId)
      await fetch('/api/integrations/sharepoint/setup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          connection_id: connectionId,
          site_id:       site?.id   ?? null,
          site_url:      site?.webUrl ?? null,
          folder_path:   folderPath.trim() || 'NavHub/Documents',
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2.5">
      <p className="text-xs font-medium text-foreground">Site &amp; default folder</p>
      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground">SharePoint Site</label>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          disabled={loading || sites.length === 0}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {loading && <option>Loading sites…</option>}
          {!loading && sites.length === 0 && <option value="">No sites available</option>}
          {sites.map(s => (
            <option key={s.id} value={s.id}>{s.name} — {s.webUrl}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground">Default folder path</label>
        <input
          value={folderPath}
          onChange={e => setFolderPath(e.target.value)}
          placeholder="NavHub/Documents"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="h-7 text-xs gap-1" onClick={() => void handleSave()} disabled={saving}>
          {saving
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
            : saved
              ? <><Check className="h-3 w-3" /> Saved</>
              : <><Save className="h-3 w-3" /> Save Site &amp; Folder</>}
        </Button>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export type IntegrationsScope = 'all' | 'financials' | 'marketing' | 'documents'

export default function IntegrationsTab({ scope = 'all' }: { scope?: IntegrationsScope } = {}) {
  const showXero       = scope === 'all' || scope === 'financials'
  const showMarketing  = scope === 'all' || scope === 'marketing'
  const showSharePoint = scope === 'all' || scope === 'documents'

  const [companies,         setCompanies]         = useState<CompanyOption[]>([])
  const [divisions,         setDivisions]         = useState<DivisionOption[]>([])
  const [connections,       setConnections]       = useState<XeroConn[]>([])
  const [loading,           setLoading]           = useState(true)
  const [linkSaving,        setLinkSaving]        = useState<string | null>(null)
  const [linkToast,         setLinkToast]         = useState<Record<string, string>>({})

  // SharePoint state
  const [spConnection,      setSpConnection]      = useState<SharePointConnection | null>(null)
  const [spConfigured,      setSpConfigured]      = useState(true)
  const [spDisconnecting,   setSpDisconnecting]   = useState(false)
  const [spMappings,        setSpMappings]        = useState<FolderMapping[]>([])
  const [spFolders,         setSpFolders]         = useState<{ id: string; name: string }[]>([])
  const [spMappingSaving,   setSpMappingSaving]   = useState<string | null>(null)  // folder_id or 'default'
  // Local editable copies of sharepoint paths
  const [spPathEdits,       setSpPathEdits]       = useState<Record<string, string>>({})  // folder_id|'default' -> path

  // Marketing connections state
  const [mktConnections,    setMktConnections]    = useState<MarketingConn[]>([])
  const [mktSyncing,        setMktSyncing]        = useState<string | null>(null)   // platform key
  const [mktDisconnecting,  setMktDisconnecting]  = useState<string | null>(null)  // platform key
  const [mktToast,          setMktToast]          = useState<Record<string, string>>({})

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadSharePointStatus = useCallback(async () => {
    try {
      const [spRes, mapRes, foldersRes] = await Promise.all([
        fetch('/api/integrations/sharepoint/status'),
        fetch('/api/integrations/sharepoint/mappings'),
        fetch('/api/documents/folders'),
      ])
      const spJson      = spRes.ok      ? await spRes.json() as { data: SharePointConnection | null; configured?: boolean } : { data: null }
      const mapJson     = mapRes.ok     ? await mapRes.json() as { data: FolderMapping[] }             : { data: [] }
      const foldersJson = foldersRes.ok ? await foldersRes.json() as { data: { id: string; name: string }[] } : { data: [] }
      setSpConnection(spJson.data)
      setSpConfigured(spJson.configured !== false)
      setSpFolders(foldersJson.data ?? [])
      const mappings = mapJson.data ?? []
      setSpMappings(mappings)
      // Initialise path edits from DB
      const edits: Record<string, string> = {}
      mappings.forEach(m => {
        const key = m.folder_id ?? 'default'
        edits[key] = m.sharepoint_path
      })
      setSpPathEdits(edits)
    } catch { /* silent */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, xRes, mRes] = await Promise.all([
        fetch('/api/companies?include_inactive=false'),
        fetch('/api/xero/connections'),
        fetch('/api/marketing/connections'),
      ])
      const cJson  = await cRes.json()
      const xJson  = await xRes.json()
      const mJson  = mRes.ok  ? await mRes.json() as { data: MarketingConn[] } : { data: [] }

      const companyList: CompanyOption[] = cJson.data ?? []
      setCompanies(companyList)

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
      setMktConnections(mJson.data ?? [])
      await loadSharePointStatus()
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [loadSharePointStatus])

  useEffect(() => { void load() }, [load])

  // Listen for SharePoint popup messages
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'sharepoint-connected') {
        void loadSharePointStatus()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [loadSharePointStatus])

  // Auto-clear link toasts
  useEffect(() => {
    const ids = Object.keys(linkToast)
    if (ids.length === 0) return
    const t = setTimeout(() => setLinkToast({}), 3000)
    return () => clearTimeout(t)
  }, [linkToast])

  // Auto-clear marketing toasts
  useEffect(() => {
    const ids = Object.keys(mktToast)
    if (ids.length === 0) return
    const t = setTimeout(() => setMktToast({}), 3000)
    return () => clearTimeout(t)
  }, [mktToast])

  // ── Xero handlers ───────────────────────────────────────────────────────────

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

  // ── SharePoint handlers ─────────────────────────────────────────────────────

  function connectSharePoint() {
    window.open(
      '/api/integrations/sharepoint/connect',
      'sharepoint-auth',
      'width=600,height=700,left=200,top=100'
    )
  }

  async function handleSaveMapping(folderId: string | null, autoSync: boolean) {
    const key = folderId ?? 'default'
    const path = spPathEdits[key] ?? '/NavHub'
    setSpMappingSaving(key)
    try {
      await fetch('/api/integrations/sharepoint/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: folderId, sharepoint_path: path, auto_sync: autoSync }),
      })
      await loadSharePointStatus()
    } catch { /* silent */ } finally {
      setSpMappingSaving(null)
    }
  }

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

  // ── Marketing handlers ──────────────────────────────────────────────────────

  function getConnectedPlatforms(): Set<MarketingPlatform> {
    return new Set(mktConnections.filter(c => c.is_active).map(c => c.platform))
  }

  function getMarketingConn(platform: MarketingPlatform): MarketingConn | undefined {
    return mktConnections.find(c => c.platform === platform && c.is_active)
  }

  async function handleMarketingSync(platform: MarketingPlatform) {
    const endpoint = SYNC_ENDPOINTS[platform]
    if (!endpoint) return
    setMktSyncing(platform)
    try {
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      })
      const json = await res.json() as { synced?: number; errors?: string[] }
      if (!res.ok || (json.errors?.length)) {
        setMktToast(t => ({ ...t, [platform]: json.errors?.[0] ?? 'Sync failed' }))
      } else {
        setMktToast(t => ({ ...t, [platform]: `Synced` }))
        // Reload connections to update last_synced_at
        void load()
      }
    } catch {
      setMktToast(t => ({ ...t, [platform]: 'Sync failed' }))
    } finally {
      setMktSyncing(null)
    }
  }

  async function handleMarketingDisconnect(platform: MarketingPlatform) {
    if (!confirm(`Disconnect ${MARKETING_PLATFORM_LABELS[platform]}? Your historical data will be preserved.`)) return
    setMktDisconnecting(platform)
    try {
      await fetch(`/api/marketing/connections?platform=${platform}`, { method: 'DELETE' })
      setMktConnections(cs => cs.filter(c => c.platform !== platform))
      setMktToast(t => ({ ...t, [platform]: 'Disconnected' }))
    } catch {
      setMktToast(t => ({ ...t, [platform]: 'Failed to disconnect' }))
    } finally {
      setMktDisconnecting(null)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const divisionList = divisions.map(d => ({ id: d.id, name: d.name, company_name: d.company_name }))
  const connectedPlatforms = getConnectedPlatforms()

  return (
    <div className="space-y-6">

      {/* ── Xero Connections ────────────────────────────────────────────────── */}
      {showXero && (
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

        {!loading && (
          <ConnectXero companies={companies} divisions={divisionList} />
        )}
      </div>
      )}

      {/* ── Marketing Platforms ─────────────────────────────────────────────── */}
      {showMarketing && (
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
                {group.platforms.map(platform => {
                  const isConnected  = connectedPlatforms.has(platform)
                  const conn         = getMarketingConn(platform)
                  const hasOAuth     = platform in OAUTH_PLATFORMS
                  const connectUrl   = OAUTH_PLATFORMS[platform]
                  const isSyncing    = mktSyncing === platform
                  const isDisconning = mktDisconnecting === platform
                  const toast        = mktToast[platform]

                  return (
                    <div
                      key={platform}
                      className="rounded-lg border border-border bg-card px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xl flex-shrink-0">{MARKETING_PLATFORM_ICONS[platform]}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {MARKETING_PLATFORM_LABELS[platform]}
                            </p>
                            {isConnected && conn ? (
                              <p className="text-xs text-muted-foreground truncate">
                                {conn.external_account_name
                                  ? `Connected: ${conn.external_account_name}`
                                  : 'Connected'}
                                {conn.last_synced_at && ` · Last synced ${new Date(conn.last_synced_at).toLocaleDateString('en-AU')}`}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {hasOAuth ? 'Not connected' : 'Manual entry supported'}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Toast message */}
                          {toast && (
                            <span className={`text-xs ${toast.includes('fail') || toast.includes('error') ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                              {toast}
                            </span>
                          )}

                          {isConnected ? (
                            <>
                              {/* Sync Now */}
                              {SYNC_ENDPOINTS[platform] && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs gap-1"
                                  onClick={() => void handleMarketingSync(platform)}
                                  disabled={isSyncing || isDisconning}
                                >
                                  {isSyncing
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <RefreshCw className="h-3 w-3" />
                                  }
                                  Sync
                                </Button>
                              )}
                              {/* Disconnect */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950 gap-1"
                                onClick={() => void handleMarketingDisconnect(platform)}
                                disabled={isDisconning || isSyncing}
                              >
                                {isDisconning
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Link2Off className="h-3 w-3" />
                                }
                                Disconnect
                              </Button>
                            </>
                          ) : hasOAuth ? (
                            <a href={connectUrl}>
                              <Button size="sm" className="h-7 px-3 text-xs gap-1">
                                <Link2 className="h-3 w-3" />
                                Connect
                              </Button>
                            </a>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
                              Coming soon
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ── SharePoint / OneDrive ────────────────────────────────────────────── */}
      {showSharePoint && (
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
          <>
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

                <SharePointSitePicker
                  currentSiteUrl={spConnection.site_url ?? null}
                  currentFolderPath={spConnection.folder_path ?? 'NavHub/Documents'}
                  connectionId={spConnection.id}
                  onSaved={() => void loadSharePointStatus()}
                />

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={connectSharePoint}
                    title="Re-authenticate with a different Microsoft account"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Reconnect
                  </Button>
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
                </div>
              </CardContent>
            </Card>

            {/* Folder Sync Settings */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Folder Sync Settings</CardTitle>
                <CardDescription className="text-xs">
                  Configure which SharePoint path each document folder syncs to.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Default path */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Default path (all folders)</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={spPathEdits['default'] ?? '/NavHub'}
                      onChange={e => setSpPathEdits(prev => ({ ...prev, default: e.target.value }))}
                      placeholder="/NavHub"
                      className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 gap-1"
                      disabled={spMappingSaving === 'default'}
                      onClick={() => void handleSaveMapping(null, spMappings.find(m => m.folder_id === null)?.auto_sync ?? false)}
                    >
                      {spMappingSaving === 'default'
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Save className="h-3 w-3" />
                      }
                      Save
                    </Button>
                  </div>
                </div>

                {/* Per-folder paths — show all folders */}
                {spFolders.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Folder-specific paths</p>
                    <p className="text-[10px] text-muted-foreground">Documents in each folder will sync to the specified SharePoint path. Leave blank to use the default.</p>
                    {spFolders.map(folder => {
                      const key = folder.id
                      const existingMapping = spMappings.find(m => m.folder_id === folder.id)
                      const autoSync = existingMapping?.auto_sync ?? false
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-xs text-foreground min-w-[120px] truncate">{folder.name}</span>
                          <input
                            type="text"
                            value={spPathEdits[key] ?? existingMapping?.sharepoint_path ?? ''}
                            onChange={e => setSpPathEdits(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder="(uses default)"
                            className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={autoSync}
                              onChange={e => void handleSaveMapping(folder.id, e.target.checked)}
                              className="h-3.5 w-3.5"
                            />
                            Auto
                          </label>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 gap-1"
                            disabled={spMappingSaving === key}
                            onClick={() => void handleSaveMapping(folder.id, autoSync)}
                          >
                            {spMappingSaving === key
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Save className="h-3 w-3" />
                            }
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="space-y-3">
            {!spConfigured && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <span className="shrink-0 mt-0.5">⚠️</span>
                <p className="text-xs">SharePoint is not configured. Add <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded">SHAREPOINT_CLIENT_ID</code> and <code className="font-mono bg-amber-100 dark:bg-amber-900 px-1 rounded">SHAREPOINT_CLIENT_SECRET</code> to your environment variables.</p>
              </div>
            )}
            <div className="rounded-lg border border-border bg-card px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📎</span>
                <div>
                  <p className="text-sm font-medium text-foreground">Microsoft SharePoint / OneDrive</p>
                  <p className="text-xs text-muted-foreground">
                    {spConfigured ? 'Not connected — sync documents to your SharePoint site' : 'Not configured'}
                  </p>
                </div>
              </div>
              {spConfigured && (
                <Button size="sm" className="gap-1.5" onClick={connectSharePoint}>
                  <Link2 className="h-3.5 w-3.5" />
                  Connect
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      )}

    </div>
  )
}
