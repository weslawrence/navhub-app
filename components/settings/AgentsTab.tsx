'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bot, CheckCircle2, Globe, Plus, Pencil, Trash2, Loader2, X, Play, Save, AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Badge }  from '@/components/ui/badge'
import { cn }     from '@/lib/utils'
import type { CustomTool, ToolParameter } from '@/lib/types'

// ─── Default tools info (display-only) ───────────────────────────────────────

const DEFAULT_TOOLS: Array<{ name: string; description: string }> = [
  { name: 'Read financial data', description: 'when agent has Financials read access' },
  { name: 'Read documents',      description: 'when agent has Documents read access' },
  { name: 'Create documents',    description: 'when agent has Documents write access' },
  { name: 'Update documents',    description: 'when agent has Documents write access' },
  { name: 'Render reports',      description: 'when agent has Reports write access' },
  { name: 'List templates',      description: 'when agent has Reports read access' },
  { name: 'Read marketing data', description: 'when agent has Marketing read access' },
  { name: 'Ask user',            description: 'always available' },
  { name: 'Read attachments',    description: 'always available' },
]

// ─── Empty tool form ─────────────────────────────────────────────────────────

interface EditableTool {
  id?:          string
  name:         string
  label:        string
  description:  string
  webhook_url:  string
  http_method:  'GET' | 'POST' | 'PUT' | 'PATCH'
  headers:      Array<{ key: string; value: string }>
  parameters:   ToolParameter[]
  is_active:    boolean
}

function emptyTool(): EditableTool {
  return {
    name:        '',
    label:       '',
    description: '',
    webhook_url: '',
    http_method: 'POST',
    headers:     [],
    parameters:  [],
    is_active:   true,
  }
}

function editableFromCustom(ct: CustomTool): EditableTool {
  return {
    id:          ct.id,
    name:        ct.name,
    label:       ct.label,
    description: ct.description,
    webhook_url: ct.webhook_url,
    http_method: ct.http_method,
    headers:     Object.entries(ct.headers ?? {}).map(([key, value]) => ({ key, value })),
    parameters:  Array.isArray(ct.parameters) ? ct.parameters : [],
    is_active:   ct.is_active,
  }
}

// ─── Tool editor modal ───────────────────────────────────────────────────────

function ToolEditorModal({
  initial,
  onSave,
  onClose,
}: {
  initial: EditableTool
  onSave:  (saved: CustomTool) => void
  onClose: () => void
}) {
  const [tool,    setTool]    = useState<EditableTool>(initial)
  const [saving,  setSaving]  = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; response?: unknown; error?: string; elapsed_ms?: number } | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  function setField<K extends keyof EditableTool>(key: K, value: EditableTool[K]) {
    setTool(prev => ({ ...prev, [key]: value }))
  }

  function addHeader() {
    setTool(prev => ({ ...prev, headers: [...prev.headers, { key: '', value: '' }] }))
  }
  function removeHeader(idx: number) {
    setTool(prev => ({ ...prev, headers: prev.headers.filter((_, i) => i !== idx) }))
  }
  function updateHeader(idx: number, field: 'key' | 'value', v: string) {
    setTool(prev => ({
      ...prev,
      headers: prev.headers.map((h, i) => i === idx ? { ...h, [field]: v } : h),
    }))
  }

  function addParameter() {
    setTool(prev => ({
      ...prev,
      parameters: [...prev.parameters, { name: '', type: 'string', required: false, description: '' }],
    }))
  }
  function removeParameter(idx: number) {
    setTool(prev => ({ ...prev, parameters: prev.parameters.filter((_, i) => i !== idx) }))
  }
  function updateParameter(idx: number, patch: Partial<ToolParameter>) {
    setTool(prev => ({
      ...prev,
      parameters: prev.parameters.map((p, i) => i === idx ? { ...p, ...patch } : p),
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name:        tool.name,
        label:       tool.label,
        description: tool.description,
        webhook_url: tool.webhook_url,
        http_method: tool.http_method,
        headers:     Object.fromEntries(
          tool.headers.filter(h => h.key.trim()).map(h => [h.key.trim(), h.value]),
        ),
        parameters:  tool.parameters.filter(p => p.name.trim()),
        is_active:   tool.is_active,
      }

      const url    = tool.id ? `/api/settings/custom-tools/${tool.id}` : '/api/settings/custom-tools'
      const method = tool.id ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const json = await res.json() as { data?: CustomTool; error?: string }
      if (!res.ok) {
        setError(json.error ?? 'Failed to save')
        return
      }
      if (json.data) onSave(json.data)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    if (!tool.id) {
      setError('Save the tool first before testing.')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res  = await fetch(`/api/settings/custom-tools/${tool.id}/test`, { method: 'POST' })
      const json = await res.json() as { data?: typeof testResult; error?: string }
      if (json.data) setTestResult(json.data)
      if (json.error) setError(json.error)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-background border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold">{tool.id ? 'Edit Custom Tool' : 'Add Custom Tool'}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tool name <span className="text-muted-foreground font-normal">(snake_case)</span></Label>
              <Input
                value={tool.name}
                onChange={e => setField('name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="get_customer_data"
                disabled={!!tool.id}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Display label</Label>
              <Input
                value={tool.label}
                onChange={e => setField('label', e.target.value)}
                placeholder="Get Customer Data"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground font-normal">(shown to agent)</span></Label>
            <textarea
              value={tool.description}
              onChange={e => setField('description', e.target.value)}
              placeholder="Retrieves customer info from the CRM by email or customer ID"
              rows={3}
              className="w-full resize-y rounded-md border border-input bg-transparent p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-[100px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label>Method</Label>
              <select
                value={tool.http_method}
                onChange={e => setField('http_method', e.target.value as EditableTool['http_method'])}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Webhook URL</Label>
              <Input
                value={tool.webhook_url}
                onChange={e => setField('webhook_url', e.target.value)}
                placeholder="https://api.company.com/endpoint"
              />
            </div>
          </div>

          {/* Headers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Headers <span className="text-muted-foreground font-normal">(for authentication)</span></Label>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addHeader}>
                <Plus className="h-3 w-3" /> Add header
              </Button>
            </div>
            <div className="space-y-1.5">
              {tool.headers.length === 0 && (
                <p className="text-xs text-muted-foreground">No headers configured.</p>
              )}
              {tool.headers.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={h.key}
                    onChange={e => updateHeader(i, 'key', e.target.value)}
                    placeholder="Header name"
                    className="flex-1 font-mono text-xs"
                  />
                  <Input
                    value={h.value}
                    onChange={e => updateHeader(i, 'value', e.target.value)}
                    placeholder="Value"
                    className="flex-1 font-mono text-xs"
                  />
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => removeHeader(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Parameters <span className="text-muted-foreground font-normal">(sent by agent)</span></Label>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addParameter}>
                <Plus className="h-3 w-3" /> Add parameter
              </Button>
            </div>
            {tool.parameters.length === 0 && (
              <p className="text-xs text-muted-foreground">No parameters — the tool will be called with an empty body.</p>
            )}
            {tool.parameters.map((p, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/20">
                <div className="grid grid-cols-[1fr_100px_80px_40px] gap-2">
                  <Input
                    value={p.name}
                    onChange={e => updateParameter(i, { name: e.target.value })}
                    placeholder="parameter_name"
                    className="font-mono text-xs"
                  />
                  <select
                    value={p.type}
                    onChange={e => updateParameter(i, { type: e.target.value as ToolParameter['type'] })}
                    className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="array">array</option>
                  </select>
                  <label className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={p.required}
                      onChange={e => updateParameter(i, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <Button size="sm" variant="ghost" className="h-9 w-9 p-0" onClick={() => removeParameter(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  value={p.description}
                  onChange={e => updateParameter(i, { description: e.target.value })}
                  placeholder="Description of what this parameter is for"
                  className="text-xs"
                />
              </div>
            ))}
          </div>

          {/* Test result */}
          {testResult && (
            <div className={cn(
              'rounded-md border px-3 py-2 text-xs space-y-1',
              testResult.ok
                ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/30 dark:text-green-400'
                : 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400',
            )}>
              <p className="font-medium">
                {testResult.ok ? '✓ Webhook responded' : '✗ Webhook failed'}
                {' · '}Status {testResult.status}
                {testResult.elapsed_ms !== undefined && ` · ${testResult.elapsed_ms}ms`}
              </p>
              {testResult.error && <p className="font-mono">{testResult.error}</p>}
              {testResult.response !== undefined && (
                <pre className="font-mono overflow-x-auto">{JSON.stringify(testResult.response, null, 2)}</pre>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t">
          <Button
            variant="outline"
            onClick={() => void handleTest()}
            disabled={testing || !tool.id}
            className="gap-1.5"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Test Webhook
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Tool
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main AgentsTab ───────────────────────────────────────────────────────────

interface AgentsTabProps {
  isAdmin: boolean
}

export default function AgentsTab({ isAdmin }: AgentsTabProps) {
  const [loading,          setLoading]          = useState(true)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [savingWebSearch,  setSavingWebSearch]  = useState(false)
  const [customTools,      setCustomTools]      = useState<CustomTool[]>([])
  const [editing,          setEditing]          = useState<EditableTool | null>(null)
  const [deleteConfirm,    setDeleteConfirm]    = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [grRes, ctRes] = await Promise.all([
        fetch('/api/groups/active'),
        fetch('/api/settings/custom-tools'),
      ])
      const grJson = await grRes.json() as { data?: { group?: { id?: string; web_search_enabled?: boolean } } }
      const ctJson = await ctRes.json() as { data?: CustomTool[] }
      setWebSearchEnabled(!!grJson.data?.group?.web_search_enabled)
      setCustomTools(ctJson.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadAll() }, [loadAll])

  async function toggleWebSearch(next: boolean) {
    setSavingWebSearch(true)
    setWebSearchEnabled(next) // optimistic
    try {
      const activeRes = await fetch('/api/groups/active')
      const activeJson = await activeRes.json() as { data?: { group?: { id?: string } } }
      const groupId = activeJson.data?.group?.id
      if (!groupId) return
      await fetch(`/api/groups/${groupId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ web_search_enabled: next }),
      })
    } finally {
      setSavingWebSearch(false)
    }
  }

  async function deleteTool(id: string) {
    await fetch(`/api/settings/custom-tools/${id}`, { method: 'DELETE' })
    setCustomTools(prev => prev.filter(t => t.id !== id))
    setDeleteConfirm(null)
  }

  function handleSaved(saved: CustomTool) {
    setCustomTools(prev => {
      const idx = prev.findIndex(t => t.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = saved
        return next
      }
      return [saved, ...prev]
    })
    setEditing(editableFromCustom(saved)) // keep modal open with saved tool so user can Test
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Section 1: Default Tools (info only) ───────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Default Tools — Auto-enabled by Access Matrix
          </CardTitle>
          <CardDescription>
            These tools are automatically available to agents based on their company and
            feature access. No configuration needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5">
            {DEFAULT_TOOLS.map(t => (
              <li key={t.name} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <span className="font-medium text-foreground w-48 shrink-0">{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.description}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* ── Section 2: Additional Tools ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Additional Tools
          </CardTitle>
          <CardDescription>
            Enable extra tools for all agents in this group. Individual agents can override
            these in their Access tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3 rounded-md border px-4 py-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Web Search</p>
                {webSearchEnabled && <Badge variant="secondary" className="text-[10px] px-1.5">Enabled</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Allow agents to search the internet for current information.
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Agents with web search can access external websites.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={webSearchEnabled}
              onClick={() => void toggleWebSearch(!webSearchEnabled)}
              disabled={!isAdmin || savingWebSearch}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors mt-1',
                webSearchEnabled ? 'bg-primary' : 'bg-muted',
                (!isAdmin || savingWebSearch) && 'opacity-50 cursor-not-allowed',
              )}
            >
              <span className={cn(
                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform',
                webSearchEnabled ? 'translate-x-5' : 'translate-x-0',
              )} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Custom Webhook Tools ────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Custom Tools</CardTitle>
              <CardDescription>
                Connect agents to your internal systems via webhooks. When an agent calls a
                custom tool, NavHub sends the configured HTTP request with the parameters
                the agent provides.
              </CardDescription>
            </div>
            {isAdmin && (
              <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setEditing(emptyTool())}>
                <Plus className="h-4 w-4" /> Add Custom Tool
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {customTools.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom tools yet. Click “Add Custom Tool” to connect your first webhook.
            </p>
          ) : (
            <div className="space-y-2">
              {customTools.map(t => (
                <div key={t.id} className="rounded-md border p-3 bg-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-sm font-mono text-foreground">{t.name}</code>
                        <span className="text-sm text-foreground">{t.label}</span>
                        {!t.is_active && <Badge variant="outline" className="text-[10px]">Disabled</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                        {t.http_method} {t.webhook_url}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm" variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => setEditing(editableFromCustom(t))}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {deleteConfirm === t.id ? (
                          <>
                            <Button
                              size="sm" variant="destructive"
                              className="h-8 text-xs"
                              onClick={() => void deleteTool(t.id)}
                            >
                              Confirm
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setDeleteConfirm(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm" variant="ghost"
                            className="h-8 w-8 p-0 text-destructive"
                            onClick={() => setDeleteConfirm(t.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor modal */}
      {editing && (
        <ToolEditorModal
          initial={editing}
          onSave={handleSaved}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
