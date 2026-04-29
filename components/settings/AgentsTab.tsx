'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bot, CheckCircle2, Globe, Plus, Pencil, Trash2, Loader2, X, Play, Save, AlertTriangle,
  Cpu, Star, Eye, EyeOff, BookOpen, FileText, Link2, Upload,
  ExternalLink, HelpCircle, KeyRound,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Badge }  from '@/components/ui/badge'
import { cn }     from '@/lib/utils'
import type {
  CustomTool, ToolParameter,
  GroupModelConfig, GroupAgentKnowledge, GroupAgentKnowledgeDocument,
  KnowledgeLink,
} from '@/lib/types'
import DocumentPickerModal from '@/components/agents/DocumentPickerModal'
import BulkLinkAdder, { type BulkAddedLink } from '@/components/shared/BulkLinkAdder'

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

// ─── Model config editor modal ───────────────────────────────────────────────

interface EditableModelConfig {
  id?:         string
  label:       string
  provider:    'anthropic' | 'openai' | 'google' | 'mistral' | 'custom'
  model_name:  string
  api_key:     string
  is_default:  boolean
}

const PROVIDER_PRESETS: Record<string, string[]> = {
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-6'],
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  google:    ['gemini-1.5-pro', 'gemini-1.5-flash'],
  mistral:   ['mistral-large-latest', 'mistral-small-latest'],
  custom:    [],
}

function ModelConfigModal({
  initial, onSave, onClose,
}: {
  initial: EditableModelConfig
  onSave:  (saved: GroupModelConfig) => void
  onClose: () => void
}) {
  const [cfg,        setCfg]        = useState<EditableModelConfig>(initial)
  const [saving,     setSaving]     = useState(false)
  const [showKey,    setShowKey]    = useState(false)
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; message: string } | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  function setField<K extends keyof EditableModelConfig>(key: K, value: EditableModelConfig[K]) {
    setCfg(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const url    = cfg.id ? `/api/settings/model-configs/${cfg.id}` : '/api/settings/model-configs'
      const method = cfg.id ? 'PATCH' : 'POST'
      const body: Record<string, unknown> = {
        label:      cfg.label.trim(),
        provider:   cfg.provider,
        model_name: cfg.model_name.trim(),
        is_default: cfg.is_default,
      }
      if (cfg.api_key.trim()) body.api_key = cfg.api_key.trim()
      // POST requires api_key; PATCH allows omitting it (keep existing)
      if (!cfg.id && !body.api_key) { setError('API key is required'); setSaving(false); return }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const json = await res.json() as { data?: GroupModelConfig; error?: string }
      if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
      if (json.data) onSave(json.data)
    } finally { setSaving(false) }
  }

  async function handleTest() {
    if (!cfg.id) { setError('Save the configuration first before testing.'); return }
    setTesting(true)
    setTestResult(null)
    try {
      const res  = await fetch(`/api/settings/model-configs/${cfg.id}/test`, { method: 'POST' })
      const json = await res.json() as { ok: boolean; status: number; message: string }
      setTestResult(json)
    } finally { setTesting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-background border rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold">{cfg.id ? 'Edit Model' : 'Add Model'}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input value={cfg.label} onChange={e => setField('label', e.target.value)} placeholder="Claude Sonnet (Fast)" />
          </div>

          <div className="space-y-1.5">
            <Label>Provider</Label>
            <select
              value={cfg.provider}
              onChange={e => setField('provider', e.target.value as EditableModelConfig['provider'])}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
              <option value="mistral">Mistral</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Model name</Label>
            {PROVIDER_PRESETS[cfg.provider].length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {PROVIDER_PRESETS[cfg.provider].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setField('model_name', m)}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs border transition-colors',
                      cfg.model_name === m ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            <Input
              value={cfg.model_name}
              onChange={e => setField('model_name', e.target.value)}
              placeholder="claude-sonnet-4-6"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label>API Key {cfg.id && <span className="text-muted-foreground font-normal">(leave blank to keep existing)</span>}</Label>
            <div className="flex gap-2">
              <Input
                type={showKey ? 'text' : 'password'}
                value={cfg.api_key}
                onChange={e => setField('api_key', e.target.value)}
                placeholder="sk-..."
                className="flex-1 font-mono text-xs"
              />
              <Button type="button" variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setShowKey(s => !s)}>
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.is_default}
              onChange={e => setField('is_default', e.target.checked)}
              className="rounded"
            />
            <span>Set as default for this group</span>
          </label>

          {testResult && (
            <div className={cn(
              'rounded-md border px-3 py-2 text-xs',
              testResult.ok
                ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/30 dark:text-green-400'
                : 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400',
            )}>
              {testResult.ok ? '✓ Connected' : `✗ ${testResult.message}`}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t">
          <Button
            variant="outline" onClick={() => void handleTest()}
            disabled={testing || !cfg.id} className="gap-1.5"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Test Connection
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Provider Key Help Map ───────────────────────────────────────────────────

interface ProviderKeyHelp { label: string; url: string; instructions: string }

const PROVIDER_KEY_HELP: Record<string, ProviderKeyHelp> = {
  anthropic: {
    label:        'Get Anthropic API key',
    url:          'https://console.anthropic.com/settings/keys',
    instructions: 'Sign in to Anthropic Console → Settings → API Keys → Create Key',
  },
  openai: {
    label:        'Get OpenAI API key',
    url:          'https://platform.openai.com/api-keys',
    instructions: 'Sign in to OpenAI Platform → API Keys → Create new secret key',
  },
  google: {
    label:        'Get Google AI API key',
    url:          'https://aistudio.google.com/app/apikey',
    instructions: 'Sign in to Google AI Studio → Get API key → Create API key',
  },
  mistral: {
    label:        'Get Mistral API key',
    url:          'https://console.mistral.ai/api-keys/',
    instructions: 'Sign in to Mistral Console → API Keys → Create new key',
  },
  custom: {
    label:        '',
    url:          '',
    instructions: 'Enter the base URL and API key for your custom OpenAI-compatible provider',
  },
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai:    'OpenAI',
  google:    'Google',
  mistral:   'Mistral',
  custom:    'Custom',
}

// ─── Provider Keys Panel + Modal ────────────────────────────────────────────

interface ProviderConfigRow {
  provider:       string
  is_configured:  boolean
  api_key_masked: string | null
  base_url:       string | null
  created_at:     string | null
}

function ProviderKeyModal({
  provider, hasExisting, hasBaseUrl, onSave, onClose,
}: {
  provider:    string
  hasExisting: boolean
  hasBaseUrl?: string | null
  onSave:      () => void
  onClose:     () => void
}) {
  const [apiKey,     setApiKey]     = useState('')
  const [baseUrl,    setBaseUrl]    = useState(hasBaseUrl ?? '')
  const [showKey,    setShowKey]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; message: string } | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  const help = PROVIDER_KEY_HELP[provider]

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      if (!apiKey.trim() && !hasExisting) {
        setError('API key is required')
        setSaving(false)
        return
      }
      const body: Record<string, unknown> = { provider }
      if (apiKey.trim()) body.api_key = apiKey.trim()
      if (provider === 'custom' && baseUrl.trim()) body.base_url = baseUrl.trim()
      // PATCH semantics: when editing without changing key, no api_key supplied — but POST requires one.
      // For edits without key change, just close (UI keeps the existing key).
      if (!apiKey.trim() && hasExisting && (provider !== 'custom' || baseUrl === (hasBaseUrl ?? ''))) {
        onClose()
        return
      }
      const res = await fetch('/api/settings/provider-configs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
      onSave()
    } finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res  = await fetch(`/api/settings/provider-configs/${provider}/test`, { method: 'POST' })
      const json = await res.json() as { ok: boolean; status: number; message: string }
      setTestResult(json)
    } finally { setTesting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-background border rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-semibold">{hasExisting ? 'Edit' : 'Add'} {PROVIDER_LABELS[provider]} API Key</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {provider === 'custom' && (
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://api.custom-provider.com/v1"
                className="font-mono text-xs"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label>API Key</Label>
              {help?.url && (
                <a
                  href={help.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={help.instructions}
                  className="text-muted-foreground hover:text-primary"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={hasExisting ? 'Leave blank to keep existing' : 'sk-...'}
                className="flex-1 font-mono text-xs"
              />
              <Button type="button" variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setShowKey(s => !s)}>
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {help && (
            <div className="rounded-md bg-muted/50 border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">{help.instructions}</p>
              {help.url && (
                <a
                  href={help.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {help.label}
                </a>
              )}
            </div>
          )}

          {testResult && (
            <div className={cn(
              'rounded-md border px-3 py-2 text-xs',
              testResult.ok
                ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/30 dark:text-green-400'
                : 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400',
            )}>
              {testResult.ok ? '✓ Connected' : `✗ ${testResult.message}`}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t">
          <Button
            variant="outline" onClick={() => void handleTest()}
            disabled={testing || (!hasExisting && !apiKey.trim())} className="gap-1.5"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Test Connection
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProviderKeysPanel({ isAdmin }: { isAdmin: boolean }) {
  const [loading,    setLoading]    = useState(true)
  const [providers,  setProviders]  = useState<ProviderConfigRow[]>([])
  const [editing,    setEditing]    = useState<string | null>(null)
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)
  const [testingFor,    setTestingFor]    = useState<string | null>(null)
  const [testResults,   setTestResults]   = useState<Record<string, { ok: boolean; message: string }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/settings/provider-configs')
      const json = await res.json() as { data?: ProviderConfigRow[] }
      setProviders(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function testProvider(provider: string) {
    setTestingFor(provider)
    try {
      const res = await fetch(`/api/settings/provider-configs/${provider}/test`, { method: 'POST' })
      const json = await res.json() as { ok: boolean; message: string }
      setTestResults(prev => ({ ...prev, [provider]: { ok: json.ok, message: json.message } }))
    } finally {
      setTestingFor(null)
    }
  }

  async function removeProvider(provider: string) {
    await fetch(`/api/settings/provider-configs/${provider}`, { method: 'DELETE' })
    setProviders(prev => prev.map(p => p.provider === provider ? { ...p, is_configured: false, api_key_masked: null } : p))
    setRemoveConfirm(null)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const editingRow = editing ? providers.find(p => p.provider === editing) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" /> Provider API Keys
        </CardTitle>
        <CardDescription>
          Configure API keys for AI providers. Agents select which provider and model to use independently.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {providers.map(p => {
          const result = testResults[p.provider]
          return (
            <div key={p.provider} className="rounded-md border p-3 bg-card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{PROVIDER_LABELS[p.provider]}</span>
                    {p.is_configured ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 text-muted-foreground">
                        Not configured
                      </Badge>
                    )}
                  </div>
                  {p.is_configured && (
                    <>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">API key: ••••••••••••••••</p>
                      {p.base_url && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">Base URL: {p.base_url}</p>
                      )}
                    </>
                  )}
                  {result && (
                    <p className={cn(
                      'text-xs mt-1',
                      result.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive',
                    )}>
                      {result.ok ? '✓ Connected' : `✗ ${result.message}`}
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    {!p.is_configured ? (
                      <Button size="sm" className="h-8 text-xs" onClick={() => setEditing(p.provider)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Key
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm" variant="ghost" className="h-8 text-xs px-2"
                          onClick={() => void testProvider(p.provider)}
                          disabled={testingFor === p.provider}
                        >
                          {testingFor === p.provider ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Test'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditing(p.provider)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {removeConfirm === p.provider ? (
                          <>
                            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => void removeProvider(p.provider)}>Confirm</Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setRemoveConfirm(null)}>Cancel</Button>
                          </>
                        ) : (
                          <Button
                            size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive"
                            onClick={() => setRemoveConfirm(p.provider)}
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>

      {editingRow && (
        <ProviderKeyModal
          provider={editingRow.provider}
          hasExisting={editingRow.is_configured}
          hasBaseUrl={editingRow.base_url}
          onSave={() => { setEditing(null); void load() }}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

// ─── Universal Knowledge Panel ────────────────────────────────────────────────

function UniversalKnowledgePanel({ isAdmin }: { isAdmin: boolean }) {
  const [loading,         setLoading]         = useState(true)
  const [text,            setText]            = useState('')
  const [links,           setLinks]           = useState<KnowledgeLink[]>([])
  const [docs,            setDocs]            = useState<GroupAgentKnowledgeDocument[]>([])
  const [saving,          setSaving]          = useState(false)
  const [savedFlash,      setSavedFlash]      = useState(false)
  const [docPickerOpen,   setDocPickerOpen]   = useState(false)
  const [showLinkForm,    setShowLinkForm]    = useState(false)
  const [linkLabel,       setLinkLabel]       = useState('')
  const [linkUrl,         setLinkUrl]         = useState('')
  const [linkDesc,        setLinkDesc]        = useState('')
  const [editingLinkIdx,  setEditingLinkIdx]  = useState<number | null>(null)
  const [uploading,       setUploading]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/settings/agent-knowledge')
      const json = await res.json() as {
        data?: { knowledge: GroupAgentKnowledge; documents: GroupAgentKnowledgeDocument[] }
      }
      if (json.data) {
        setText(json.data.knowledge.knowledge_text ?? '')
        setLinks(json.data.knowledge.knowledge_links ?? [])
        setDocs(json.data.documents)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function saveTextAndLinks() {
    setSaving(true)
    try {
      await fetch('/api/settings/agent-knowledge', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ knowledge_text: text || null, knowledge_links: links }),
      })
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } finally { setSaving(false) }
  }

  function addLink() {
    if (!linkUrl.trim()) return
    const newLink: KnowledgeLink = {
      url:         linkUrl.trim(),
      label:       linkLabel.trim() || linkUrl.trim(),
      description: linkDesc.trim() || undefined,
    }
    if (editingLinkIdx !== null) {
      setLinks(prev => prev.map((l, i) => i === editingLinkIdx ? newLink : l))
      setEditingLinkIdx(null)
    } else {
      setLinks(prev => [...prev, newLink])
    }
    setLinkLabel(''); setLinkUrl(''); setLinkDesc(''); setShowLinkForm(false)
  }
  function editLink(idx: number) {
    const l = links[idx]
    setLinkLabel(l.label ?? ''); setLinkUrl(l.url); setLinkDesc(l.description ?? '')
    setEditingLinkIdx(idx); setShowLinkForm(true)
  }
  function removeLink(idx: number) {
    setLinks(prev => prev.filter((_, i) => i !== idx))
  }

  async function linkDocument(docIds: { id: string; title: string }[]) {
    for (const d of docIds) {
      const res = await fetch('/api/settings/agent-knowledge/documents', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ document_id: d.id }),
      })
      if (res.ok) {
        const json = await res.json() as { data: GroupAgentKnowledgeDocument }
        setDocs(prev => [json.data, ...prev])
      }
    }
    setDocPickerOpen(false)
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/settings/agent-knowledge/documents', { method: 'POST', body: fd })
      if (res.ok) {
        const json = await res.json() as { data: GroupAgentKnowledgeDocument }
        setDocs(prev => [json.data, ...prev])
      }
    } finally { setUploading(false) }
  }

  async function removeDoc(id: string) {
    await fetch(`/api/settings/agent-knowledge/documents/${id}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" /> Universal Knowledge
        </CardTitle>
        <CardDescription>
          This knowledge is automatically provided to <span className="font-medium">all agents</span> as foundational
          context. Agent-specific knowledge takes precedence where there is overlap.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Background text */}
        <div className="space-y-2">
          <Label className="text-sm">Background Knowledge</Label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            disabled={!isAdmin}
            className="w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
            placeholder="Company overview, industry context, key terminology, operating principles…"
          />
        </div>

        {/* Reference Documents */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Reference Documents</Label>
            {isAdmin && (
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                  onClick={() => setDocPickerOpen(true)}
                >
                  <FileText className="h-3.5 w-3.5" /> Link from Documents
                </Button>
                <Button
                  size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                  disabled={uploading}
                  onClick={() => {
                    const i = document.createElement('input')
                    i.type = 'file'
                    i.accept = '.pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg'
                    i.onchange = () => { if (i.files?.[0]) void uploadFile(i.files[0]) }
                    i.click()
                  }}
                >
                  <Upload className="h-3.5 w-3.5" /> {uploading ? 'Uploading…' : 'Upload File'}
                </Button>
              </div>
            )}
          </div>
          {docs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No reference documents.</p>
          ) : (
            <div className="divide-y rounded-md border overflow-hidden">
              {docs.map(d => (
                <div key={d.id} className="flex items-center gap-3 px-3 py-2 bg-background">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{d.document_title ?? d.file_name}</p>
                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                      {d.document_id ? 'From Documents' : 'Uploaded'}
                    </Badge>
                  </div>
                  {isAdmin && (
                    <button onClick={() => void removeDoc(d.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reference Links */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Reference Links</Label>
            {isAdmin && (
              <Button
                size="sm" variant="outline" className="h-7 gap-1.5 text-xs"
                onClick={() => { setEditingLinkIdx(null); setLinkLabel(''); setLinkUrl(''); setLinkDesc(''); setShowLinkForm(true) }}
              >
                <Plus className="h-3.5 w-3.5" /> Add Link
              </Button>
            )}
          </div>
          {showLinkForm && isAdmin && (
            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <Input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Label" className="text-sm" />
              <Input value={linkUrl}   onChange={e => setLinkUrl(e.target.value)}   placeholder="https://…" className="text-sm" />
              <Input value={linkDesc}  onChange={e => setLinkDesc(e.target.value)}  placeholder="Description (optional)" className="text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={addLink} disabled={!linkUrl.trim()}>{editingLinkIdx !== null ? 'Update' : 'Add'}</Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowLinkForm(false); setEditingLinkIdx(null) }}>Cancel</Button>
              </div>
            </div>
          )}
          {isAdmin && (
            <BulkLinkAdder
              onAdd={(items: BulkAddedLink[]) =>
                setLinks(prev => [...prev, ...items.map(i => ({ url: i.url, label: i.label }))])
              }
            />
          )}
          {links.length === 0 && !showLinkForm ? (
            <p className="text-xs text-muted-foreground py-2">No reference links.</p>
          ) : (
            <div className="divide-y rounded-md border overflow-hidden">
              {links.map((l, idx) => (
                <div key={idx} className="flex items-start gap-3 px-3 py-2 bg-background">
                  <Link2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{l.url}</p>
                    {l.description && <p className="text-xs text-muted-foreground mt-0.5">{l.description}</p>}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => editLink(idx)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => removeLink(idx)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save bar */}
        {isAdmin && (
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            {savedFlash && <span className="text-xs text-green-600">Saved ✓</span>}
            <Button size="sm" onClick={() => void saveTextAndLinks()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save Knowledge
            </Button>
          </div>
        )}
      </CardContent>

      {docPickerOpen && (
        <DocumentPickerModal
          onSelect={list => void linkDocument(list)}
          onClose={() => setDocPickerOpen(false)}
          excludeIds={docs.map(d => d.document_id ?? '').filter(Boolean) as string[]}
        />
      )}
    </Card>
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

  // Model configs state
  const [modelConfigs,         setModelConfigs]         = useState<GroupModelConfig[]>([])
  const [editingModel,         setEditingModel]         = useState<EditableModelConfig | null>(null)
  const [deleteModelConfirm,   setDeleteModelConfirm]   = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [grRes, ctRes, mcRes] = await Promise.all([
        fetch('/api/groups/active'),
        fetch('/api/settings/custom-tools'),
        fetch('/api/settings/model-configs'),
      ])
      const grJson = await grRes.json() as { data?: { group?: { id?: string; web_search_enabled?: boolean } } }
      const ctJson = await ctRes.json() as { data?: CustomTool[] }
      const mcJson = await mcRes.json() as { data?: GroupModelConfig[] }
      setWebSearchEnabled(!!grJson.data?.group?.web_search_enabled)
      setCustomTools(ctJson.data ?? [])
      setModelConfigs(mcJson.data ?? [])
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

  // ─── Model config handlers ──────────────────────────────────────────────
  function emptyModel(): EditableModelConfig {
    return { label: '', provider: 'anthropic', model_name: 'claude-sonnet-4-6', api_key: '', is_default: modelConfigs.length === 0 }
  }
  function editableFromModel(m: GroupModelConfig): EditableModelConfig {
    return {
      id:         m.id,
      label:      m.label,
      provider:   (m.provider as EditableModelConfig['provider']),
      model_name: m.model_name,
      api_key:    '',   // never sent to client
      is_default: m.is_default,
    }
  }
  function handleModelSaved(saved: GroupModelConfig) {
    setModelConfigs(prev => {
      // If a new default arrived, clear it on others
      const cleared = saved.is_default ? prev.map(m => ({ ...m, is_default: false })) : prev
      const idx = cleared.findIndex(m => m.id === saved.id)
      if (idx >= 0) {
        const next = [...cleared]
        next[idx] = saved
        return next
      }
      return [saved, ...cleared]
    })
    setEditingModel(editableFromModel(saved))
  }
  async function setModelDefault(id: string) {
    const res = await fetch(`/api/settings/model-configs/${id}/set-default`, { method: 'POST' })
    if (res.ok) {
      setModelConfigs(prev => prev.map(m => ({ ...m, is_default: m.id === id })))
    }
  }
  async function deleteModel(id: string) {
    const res = await fetch(`/api/settings/model-configs/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setModelConfigs(prev => prev.filter(m => m.id !== id))
    } else {
      const json = await res.json() as { error?: string }
      alert(json.error ?? 'Failed to delete')
    }
    setDeleteModelConfirm(null)
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

      {/* ── Section 0: Provider API Keys (replaces Model Configurations) ── */}
      <ProviderKeysPanel isAdmin={isAdmin} />

      {/* ── Legacy: group_model_configs (hidden when no rows exist) ─────── */}
      {modelConfigs.length > 0 && (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" /> Legacy Model Configurations
              </CardTitle>
              <CardDescription>
                Older per-model entries. New agents now use Provider API Keys above + per-agent model selection.
                You can safely delete these once all agents are migrated.
              </CardDescription>
            </div>
            {isAdmin && (
              <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setEditingModel(emptyModel())}>
                <Plus className="h-4 w-4" /> Add Model
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {modelConfigs.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No models configured yet. Add at least one model so agents can run.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {modelConfigs.map(m => (
                <div key={m.id} className={cn('rounded-md border p-3 bg-card', m.is_default && 'ring-2 ring-primary/30')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {m.is_default && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                        <span className="text-sm font-medium text-foreground">{m.label}</span>
                        {m.is_default && <Badge variant="secondary" className="text-[10px] px-1.5">Default</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="capitalize">{m.provider}</span> · <code className="font-mono">{m.model_name}</code>
                      </p>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">API key: ••••••••••••••••</p>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        {!m.is_default && (
                          <Button
                            size="sm" variant="ghost" className="h-8 text-xs px-2"
                            onClick={() => void setModelDefault(m.id)}
                            title="Set as default"
                          >
                            Set Default
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost" className="h-8 w-8 p-0"
                          onClick={() => setEditingModel(editableFromModel(m))}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {deleteModelConfirm === m.id ? (
                          <>
                            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => void deleteModel(m.id)}>
                              Confirm
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setDeleteModelConfirm(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive"
                            onClick={() => setDeleteModelConfirm(m.id)}
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
      )}

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

      {/* ── Section 4: Universal Knowledge ─────────────────────────────── */}
      <UniversalKnowledgePanel isAdmin={isAdmin} />

      {/* Custom tool editor modal */}
      {editing && (
        <ToolEditorModal
          initial={editing}
          onSave={handleSaved}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Model config editor modal */}
      {editingModel && (
        <ModelConfigModal
          initial={editingModel}
          onSave={handleModelSaved}
          onClose={() => setEditingModel(null)}
        />
      )}
    </div>
  )
}
