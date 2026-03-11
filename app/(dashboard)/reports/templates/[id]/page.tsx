'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft, FileText, Clock, Check, X,
  BarChart2, Grid2X2, FileEdit, LayoutDashboard, Workflow,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ReportTemplate, ReportTemplateVersion, TemplateType, SlotDataSource } from '@/lib/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<TemplateType, string> = {
  financial: 'Financial', matrix: 'Matrix', narrative: 'Narrative',
  dashboard: 'Dashboard', workflow: 'Workflow',
}
const TYPE_ICONS: Record<TemplateType, React.ComponentType<{ className?: string }>> = {
  financial: BarChart2, matrix: Grid2X2, narrative: FileEdit,
  dashboard: LayoutDashboard, workflow: Workflow,
}

const SOURCE_LABELS: Record<SlotDataSource, string> = {
  navhub_financial: 'NavHub Financial',
  manual:           'Manual',
  uploaded_file:    'Uploaded File',
  agent_provided:   'Agent Provided',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

type TabKey = 'overview' | 'slots' | 'tokens' | 'versions'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TemplateDetailPage() {
  const params     = useParams()
  const router     = useRouter()
  const templateId = params?.id as string

  const [template,  setTemplate]  = useState<ReportTemplate | null>(null)
  const [versions,  setVersions]  = useState<ReportTemplateVersion[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [isAdmin,   setIsAdmin]   = useState(false)
  const [tab,       setTab]       = useState<TabKey>('overview')
  const [deleting,  setDeleting]  = useState(false)

  const load = useCallback(async () => {
    try {
      const [tmplRes, groupRes] = await Promise.all([
        fetch(`/api/report-templates/${templateId}`),
        fetch('/api/groups/active'),
      ])
      const [tmplJson, groupJson] = await Promise.all([tmplRes.json(), groupRes.json()])
      if (!tmplRes.ok) throw new Error(tmplJson.error ?? 'Not found')
      setTemplate(tmplJson.data)
      const role = groupJson.data?.role
      setIsAdmin(role === 'super_admin' || role === 'group_admin')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [templateId])

  const loadVersions = useCallback(async () => {
    try {
      const res  = await fetch(`/api/report-templates/${templateId}/versions`)
      const json = await res.json()
      setVersions(json.data ?? [])
    } catch { /* ignore */ }
  }, [templateId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (tab === 'versions') loadVersions()
  }, [tab, loadVersions])

  async function handleDelete() {
    if (!confirm(`Delete template "${template?.name}"? This action cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/report-templates/${templateId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      router.push('/reports/templates')
    } catch {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  if (error || !template) {
    return (
      <div className="space-y-4">
        <Link href="/reports/templates" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to templates
        </Link>
        <p className="text-sm text-destructive">{error ?? 'Template not found'}</p>
      </div>
    )
  }

  const Icon = TYPE_ICONS[template.template_type]

  const TABS: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: 'Overview'       },
    { key: 'slots',    label: `Slots (${template.slots.length})` },
    { key: 'tokens',   label: `Design Tokens (${Object.keys(template.design_tokens).length})` },
    { key: 'versions', label: 'Version History' },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/reports/templates" className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{template.name}</h1>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-muted text-muted-foreground">
                <Icon className="h-3 w-3" />
                {TYPE_LABELS[template.template_type]}
              </span>
              <Badge variant="outline" className="text-xs">v{template.version}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Updated {formatDate(template.updated_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/reports/templates/${templateId}/generate`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--palette-primary)' }}
          >
            <FileText className="h-4 w-4" />
            Generate Report
          </Link>
          {isAdmin && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {template.description && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Description</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{template.description}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-sm">Metadata</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="text-foreground">{TYPE_LABELS[template.template_type]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="text-foreground">{template.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground">{formatDate(template.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scaffold HTML</span>
                <span className="text-foreground">{template.scaffold_html ? '✓ Present' : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scaffold CSS</span>
                <span className="text-foreground">{template.scaffold_css ? '✓ Present' : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scaffold JS</span>
                <span className="text-foreground">{template.scaffold_js ? '✓ Present' : '—'}</span>
              </div>
            </CardContent>
          </Card>

          {template.agent_instructions && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Agent Instructions</CardTitle>
                <CardDescription>Instructions for AI agents generating content for this template.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/40 p-3 rounded-md">
                  {template.agent_instructions}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Slots tab ── */}
      {tab === 'slots' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Slot Definitions</CardTitle>
            <CardDescription>Placeholders in this template that receive data when a report is generated.</CardDescription>
          </CardHeader>
          <CardContent>
            {template.slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No slots defined.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2 pr-4 font-medium">Name</th>
                      <th className="text-left py-2 pr-4 font-medium">Label</th>
                      <th className="text-left py-2 pr-4 font-medium">Type</th>
                      <th className="text-left py-2 pr-4 font-medium">Required</th>
                      <th className="text-left py-2 pr-4 font-medium">Source</th>
                      <th className="text-left py-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {template.slots.map((slot, i) => (
                      <tr key={i} className="border-b border-border/40 last:border-0">
                        <td className="py-2 pr-4 font-mono text-xs text-foreground">{slot.name}</td>
                        <td className="py-2 pr-4 text-foreground">{slot.label}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="text-xs">{slot.type}</Badge>
                        </td>
                        <td className="py-2 pr-4">
                          {slot.required
                            ? <Check className="h-3.5 w-3.5 text-green-600" />
                            : <X className="h-3.5 w-3.5 text-muted-foreground" />}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground">{SOURCE_LABELS[slot.data_source]}</td>
                        <td className="py-2 text-xs text-muted-foreground">{slot.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Design Tokens tab ── */}
      {tab === 'tokens' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Design Tokens</CardTitle>
            <CardDescription>CSS values injected into the template stylesheet via {'{{token_name}}'} placeholders.</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(template.design_tokens).length === 0 ? (
              <p className="text-sm text-muted-foreground">No design tokens defined.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(template.design_tokens).map(([key, value]) => {
                  const isColor = /^#[0-9a-fA-F]{3,8}$|^rgb|^hsl/.test(value)
                  return (
                    <div key={key} className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0">
                      {isColor && (
                        <span
                          className="w-5 h-5 rounded border border-border/50 shrink-0"
                          style={{ backgroundColor: value }}
                        />
                      )}
                      <code className="text-xs font-mono text-muted-foreground flex-1">{`{{${key}}}`}</code>
                      <code className="text-xs font-mono text-foreground">{value}</code>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Versions tab ── */}
      {tab === 'versions' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Version History</CardTitle>
            <CardDescription>Automatically saved when the template is updated.</CardDescription>
          </CardHeader>
          <CardContent>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No previous versions recorded.</p>
            ) : (
              <div className="space-y-2">
                {versions.map(v => (
                  <div key={v.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">v{v.version}</Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(v.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
