'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Check, Plus, Eye, EyeOff, Loader2, Trash2,
  Link2, FileText, X, Upload, Search, Pencil,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button }    from '@/components/ui/button'
import { Input }     from '@/components/ui/input'
import { Label }     from '@/components/ui/label'
import { Badge }     from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn }        from '@/lib/utils'
import {
  PERSONA_PRESETS,
  type Agent, type AgentModel, type AgentTool, type PersonaPreset,
  type AgentCredential, type Company, type KnowledgeLink, type AgentKnowledgeDocument,
  type GroupModelConfig,
} from '@/lib/types'
import { AVATAR_PRESETS } from '@/lib/agent-presets'

// ─── Tool display config ──────────────────────────────────────────────────────

const PERSONA_OPTIONS: { value: PersonaPreset; label: string; description: string }[] = [
  { value: 'executive_analyst',    label: 'Executive Analyst',    description: 'Formal, concise — for C-suite audiences' },
  { value: 'business_writer',      label: 'Business Writer',      description: 'Clear prose, narrative-driven reporting' },
  { value: 'operations_assistant', label: 'Operations Assistant', description: 'Practical, bullet-points, action-focused' },
  { value: 'custom',               label: 'Custom',               description: 'Write your own persona instructions' },
]

type Tab = 'Identity' | 'Behaviour' | 'Access' | 'Knowledge' | 'Credentials' | 'Notifications'
type CompanyAccessLevel = 'none' | 'read' | 'write'
type AccessFeature = 'financials' | 'reports' | 'documents' | 'marketing' | 'agents'

const ACCESS_FEATURES: AccessFeature[] = ['financials', 'reports', 'documents', 'marketing', 'agents']
const ACCESS_FEATURE_LABELS: Record<AccessFeature, string> = {
  financials: 'Financials',
  reports:    'Reports',
  documents:  'Documents',
  marketing:  'Marketing',
  agents:     'Agents',
}

interface AgentFormProps {
  mode:      'create' | 'edit'
  agentId?:  string
}

export default function AgentForm({ mode, agentId }: AgentFormProps) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('Identity')

  // ── Agent fields ──────────────────────────────────────────────────────────
  const [name,             setName]             = useState('')
  const [description,      setDescription]      = useState('')
  const [avatarColor,      setAvatarColor]      = useState('#6366f1')
  const [avatarPreset,     setAvatarPreset]     = useState<string | null>(null)
  const [avatarUrl,        setAvatarUrl]        = useState<string | null>(null)
  const [visibility,       setVisibility]       = useState<'private' | 'public'>('private')
  const [model,            setModel]            = useState<AgentModel>('claude-sonnet-4-20250514')
  const [personaPreset,    setPersonaPreset]    = useState<PersonaPreset>('custom')
  const [persona,          setPersona]          = useState('')
  const [instructions,     setInstructions]     = useState('')
  const [tools,            setTools]            = useState<AgentTool[]>([])
  const [allCompanies,     setAllCompanies]     = useState(true)  // true = all companies in scope
  const [companyScopeIds,  setCompanyScopeIds]  = useState<string[]>([])
  const [accessMode,       setAccessMode]       = useState<'all' | 'specific'>('all')
  // feature × companyKey → level; companyKey === 'default' is fallback for all companies
  const [accessMatrix,     setAccessMatrix]     = useState<Record<string, Record<string, CompanyAccessLevel>>>({})
  const [accessLoading,    setAccessLoading]    = useState(false)
  const [accessSaving,     setAccessSaving]     = useState(false)
  const [emailAddress,     setEmailAddress]     = useState('')
  const [emailDisplayName, setEmailDisplayName] = useState('')
  const [emailRecipients,  setEmailRecipients]  = useState('')  // comma-separated
  const [slackChannel,     setSlackChannel]     = useState('')
  // Legacy model fields preserved on PATCH payload for backwards compatibility.
  // The form now drives provider/model via ai_provider + ai_model directly,
  // sourced from group_provider_configs (per-provider API keys in Settings).
  const [modelProvider,    setModelProvider]    = useState('anthropic')
  const [modelName,        setModelName]        = useState('claude-haiku-4-5-20251001')
  const [modelApiKey]                           = useState('')
  const [modelConfigId,    setModelConfigId]    = useState<string | null>(null)

  // Provider/model selection (migration 043)
  const [aiProvider,        setAiProvider]        = useState<string>('anthropic')
  const [aiModel,           setAiModel]           = useState<string>('claude-haiku-4-5-20251001')
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([])
  const [availableModels,   setAvailableModels]   = useState<{ id: string; label: string }[]>([])
  const [loadingModels,     setLoadingModels]     = useState(false)
  const avatarInputRef  = useRef<HTMLInputElement>(null)
  const colorSaveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [companies,  setCompanies]  = useState<Company[]>([])
  const [creds,      setCreds]      = useState<AgentCredential[]>([])
  const [saving,     setSaving]     = useState(false)
  const [savedRecently, setSavedRecently] = useState(false)
  const [toast,      setToast]      = useState<string | null>(null)
  const [loading,    setLoading]    = useState(mode === 'edit')

  function showSaved() {
    setSavedRecently(true)
    setTimeout(() => setSavedRecently(false), 2000)
  }

  // Credential form
  const [credName,   setCredName]   = useState('')
  const [credKey,    setCredKey]    = useState('')
  const [credValue,  setCredValue]  = useState('')
  const [credDesc,   setCredDesc]   = useState('')
  const [credShow,   setCredShow]   = useState(false)
  const [credSaving, setCredSaving] = useState(false)
  const [deleteCredConfirm, setDeleteCredConfirm] = useState<string | null>(null)

  // Notifications state
  const [notifyOnCompletion, setNotifyOnCompletion] = useState(false)
  const [notifyOnOutput,     setNotifyOnOutput]     = useState(false)
  const [notifyEmail,        setNotifyEmail]        = useState('')
  const [notifySlack,        setNotifySlack]        = useState('')
  const [slackStatus,        setSlackStatus]        = useState<{ connected: boolean; team_name?: string }>({ connected: false })

  // Knowledge state
  const [knowledgeText,   setKnowledgeText]   = useState('')
  const [knowledgeLinks,  setKnowledgeLinks]  = useState<KnowledgeLink[]>([])
  const [knowledgeDocs,   setKnowledgeDocs]   = useState<AgentKnowledgeDocument[]>([])
  const [newLinkUrl,      setNewLinkUrl]      = useState('')
  const [newLinkLabel,    setNewLinkLabel]    = useState('')
  const [newLinkDesc,     setNewLinkDesc]     = useState('')
  const [editingLinkIdx,  setEditingLinkIdx]  = useState<number | null>(null)
  const [showLinkForm,    setShowLinkForm]    = useState(false)
  const [showDocPicker,   setShowDocPicker]   = useState(false)
  const [availableDocs,   setAvailableDocs]   = useState<Array<{ id: string; title: string; document_type: string }>>([])
  const [docSearch,       setDocSearch]       = useState('')
  const [docUploading,    setDocUploading]    = useState(false)
  const [knowledgeSaved,  setKnowledgeSaved]  = useState(false)

  // ── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/companies')
      .then(r => r.json())
      .then(json => setCompanies((json.data ?? []).filter((c: Company) => c.is_active)))
      .catch(() => {})

    fetch('/api/integrations/slack/status')
      .then(r => r.json())
      .then((j: { data?: { team_name?: string } | null }) => {
        if (j.data) setSlackStatus({ connected: true, team_name: j.data.team_name })
        else        setSlackStatus({ connected: false })
      })
      .catch(() => {})

    // Legacy: pre-select group default model_config_id if no other selection.
    fetch('/api/settings/model-configs')
      .then(r => r.json())
      .then((j: { data?: GroupModelConfig[] }) => {
        const list = j.data ?? []
        if (mode === 'create' && !modelConfigId) {
          const def = list.find(m => m.is_default)
          if (def) setModelConfigId(def.id)
        }
      })
      .catch(() => {})

    // Load configured providers (group_provider_configs)
    fetch('/api/settings/provider-configs')
      .then(r => r.json())
      .then((j: { data?: Array<{ provider: string; is_configured: boolean }> }) => {
        const configured = (j.data ?? []).filter(p => p.is_configured).map(p => p.provider)
        setConfiguredProviders(configured)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load models when provider changes
  useEffect(() => {
    if (!aiProvider) return
    if (!configuredProviders.includes(aiProvider)) {
      setAvailableModels([])
      return
    }
    setLoadingModels(true)
    setAvailableModels([])
    fetch(`/api/settings/provider-configs/${aiProvider}/models`)
      .then(r => r.json())
      .then((j: { data?: { id: string; label: string }[] }) => {
        const list = j.data ?? []
        setAvailableModels(list)
        // If current model isn't in the list, reset to first available
        if (list.length > 0 && !list.find(m => m.id === aiModel)) {
          setAiModel(list[0].id)
        }
      })
      .catch(() => setAvailableModels([]))
      .finally(() => setLoadingModels(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiProvider, configuredProviders])

  const loadAgent = useCallback(async () => {
    if (!agentId) return
    const [agRes, crRes] = await Promise.all([
      fetch(`/api/agents/${agentId}`),
      fetch(`/api/agents/${agentId}/credentials`),
    ])
    const agJson = await agRes.json()
    const crJson = await crRes.json()
    if (agJson.data) {
      const a: Agent = agJson.data
      setName(a.name)
      setDescription(a.description ?? '')
      setAvatarColor(a.avatar_color)
      setAvatarPreset(a.avatar_preset ?? null)
      setAvatarUrl(a.avatar_url ?? null)
      setVisibility(a.visibility ?? 'private')
      setModel(a.model)
      setModelProvider(a.model_provider ?? 'anthropic')
      setModelName(a.model_name ?? a.model ?? 'claude-haiku-4-5-20251001')
      setModelConfigId((a as Agent & { model_config_id?: string | null }).model_config_id ?? null)
      const aWithAi = a as Agent & { ai_provider?: string | null; ai_model?: string | null }
      setAiProvider(aWithAi.ai_provider ?? 'anthropic')
      setAiModel(aWithAi.ai_model ?? aWithAi.model_name ?? a.model ?? 'claude-haiku-4-5-20251001')
      setPersonaPreset(a.persona_preset)
      setPersona(a.persona ?? '')
      setInstructions(a.instructions ?? '')
      setTools(a.tools)
      setAllCompanies(!a.company_scope || a.company_scope.length === 0)
      setCompanyScopeIds(a.company_scope ?? [])
      setEmailAddress(a.email_address ?? '')
      setEmailDisplayName(a.email_display_name ?? '')
      setEmailRecipients((a.email_recipients ?? []).join(', '))
      setSlackChannel(a.slack_channel ?? '')
    }
    if (crJson.data) setCreds(crJson.data)

    // Load knowledge
    setKnowledgeText(agJson.data?.knowledge_text ?? '')
    setKnowledgeLinks((agJson.data?.knowledge_links ?? []).map((l: { url: string; label?: string; description?: string }) => ({
      url: l.url, label: l.label ?? l.url, description: l.description,
    })))

    // Load notifications
    setNotifyOnCompletion(!!agJson.data?.notify_on_completion)
    setNotifyOnOutput(!!agJson.data?.notify_on_output)
    setNotifyEmail(agJson.data?.notify_email ?? '')
    setNotifySlack(agJson.data?.notify_slack_channel ?? '')
    try {
      const kdRes = await fetch(`/api/agents/${agentId}/knowledge/documents`)
      if (kdRes.ok) {
        const kdJson = await kdRes.json()
        setKnowledgeDocs(kdJson.data ?? [])
      }
    } catch { /* ignore */ }

    setLoading(false)
  }, [agentId])

  useEffect(() => {
    if (mode === 'edit') void loadAgent()
  }, [mode, loadAgent])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handlePersonaPresetSelect(preset: PersonaPreset) {
    setPersonaPreset(preset)
    if (preset !== 'custom') {
      setPersona(PERSONA_PRESETS[preset])
    }
  }

  async function handleAvatarUpload(file: File) {
    if (file.size > 2 * 1024 * 1024) { setToast('Image must be under 2MB'); return }
    const id = agentId
    if (!id) { setToast('Save agent first'); return }
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch(`/api/agents/${id}/avatar`, { method: 'POST', body: fd })
    const json = await res.json()
    if (json.data?.avatar_url) { setAvatarUrl(json.data.avatar_url); setAvatarPreset(null) }
  }

  // ── Feature × company access matrix (Access tab) ───────────────────────
  const loadCompanyAccess = useCallback(async () => {
    if (!agentId) return
    setAccessLoading(true)
    try {
      const res  = await fetch(`/api/agents/${agentId}/company-access`)
      const json = await res.json() as { data?: {
        mode:   'all' | 'specific'
        matrix: Record<string, Record<string, CompanyAccessLevel>>
      } }
      if (json.data) {
        setAccessMode(json.data.mode)
        setAccessMatrix(json.data.matrix ?? {})
      } else {
        setAccessMode('all')
        setAccessMatrix({})
      }
    } catch { /* ignore */ } finally { setAccessLoading(false) }
  }, [agentId])

  async function saveCompanyAccess() {
    if (!agentId) return
    setAccessSaving(true)
    try {
      await fetch(`/api/agents/${agentId}/company-access`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ mode: accessMode, matrix: accessMatrix }),
      })
      showSaved()
    } finally { setAccessSaving(false) }
  }

  function setCell(feature: AccessFeature, companyKey: string, value: CompanyAccessLevel) {
    setAccessMatrix(prev => ({
      ...prev,
      [feature]: { ...(prev[feature] ?? {}), [companyKey]: value },
    }))
  }

  function setRow(feature: AccessFeature, value: CompanyAccessLevel) {
    const row: Record<string, CompanyAccessLevel> = { default: value }
    companies.forEach(c => { row[c.id] = value })
    setAccessMatrix(prev => ({ ...prev, [feature]: row }))
  }

  function setColumn(companyKey: string, value: CompanyAccessLevel) {
    setAccessMatrix(prev => {
      const next = { ...prev }
      ACCESS_FEATURES.forEach(f => {
        next[f] = { ...(next[f] ?? {}), [companyKey]: value }
      })
      return next
    })
  }

  function setAll(value: CompanyAccessLevel) {
    const next: Record<string, Record<string, CompanyAccessLevel>> = {}
    ACCESS_FEATURES.forEach(f => {
      next[f] = { default: value }
      companies.forEach(c => { next[f][c.id] = value })
    })
    setAccessMatrix(next)
  }

  // Load company access when Access tab becomes active (edit mode only)
  useEffect(() => {
    if (tab === 'Access' && agentId) void loadCompanyAccess()
  }, [tab, agentId, loadCompanyAccess])

  // ── Knowledge handlers ───────────────────────────────────────────────────

  async function saveKnowledgeText() {
    if (!agentId) return
    setSaving(true)
    try {
      await fetch(`/api/agents/${agentId}/knowledge`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledge_text: knowledgeText || null }),
      })
      setKnowledgeSaved(true)
      setTimeout(() => setKnowledgeSaved(false), 2000)
    } finally { setSaving(false) }
  }

  async function saveKnowledgeAll() {
    if (!agentId) return
    setSaving(true)
    try {
      await fetch(`/api/agents/${agentId}/knowledge`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledge_text: knowledgeText || null, knowledge_links: knowledgeLinks }),
      })
      setKnowledgeSaved(true)
      showSaved()
      setTimeout(() => setKnowledgeSaved(false), 2000)
    } finally { setSaving(false) }
  }

  // Save current tab's changes then switch to the target tab.
  // In create mode, just switches tabs (no agent ID yet).
  async function handleTabChange(target: Tab) {
    if (mode === 'edit' && agentId) {
      // Auto-save agent fields before switching
      await handleSave()
      // Also persist knowledge if we're leaving the Knowledge tab
      if (tab === 'Knowledge') {
        await saveKnowledgeAll()
      }
      // Persist company access when leaving the Access tab
      if (tab === 'Access') {
        await saveCompanyAccess()
      }
    }
    setTab(target)
  }

  function handleAddLink() {
    if (!newLinkUrl.trim()) return
    const newLink: KnowledgeLink = { url: newLinkUrl.trim(), label: newLinkLabel.trim() || newLinkUrl.trim(), description: newLinkDesc.trim() || undefined }
    if (editingLinkIdx !== null) {
      setKnowledgeLinks(prev => prev.map((l, i) => i === editingLinkIdx ? newLink : l))
      setEditingLinkIdx(null)
    } else {
      setKnowledgeLinks(prev => [...prev, newLink])
    }
    setNewLinkUrl(''); setNewLinkLabel(''); setNewLinkDesc(''); setShowLinkForm(false)
  }

  function handleEditLink(idx: number) {
    const link = knowledgeLinks[idx]
    setNewLinkUrl(link.url); setNewLinkLabel(link.label ?? ''); setNewLinkDesc(link.description ?? '')
    setEditingLinkIdx(idx); setShowLinkForm(true)
  }

  function handleRemoveLink(idx: number) {
    setKnowledgeLinks(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleRemoveKnowledgeDoc(id: string) {
    if (!agentId) return
    try {
      await fetch(`/api/agents/${agentId}/knowledge/documents/${id}`, { method: 'DELETE' })
      setKnowledgeDocs(prev => prev.filter(d => d.id !== id))
    } catch { /* ignore */ }
  }

  async function handleLinkDocument(docId: string) {
    if (!agentId) return
    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge/documents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: docId }),
      })
      if (res.ok) {
        const json = await res.json()
        setKnowledgeDocs(prev => [json.data, ...prev])
      }
    } catch { /* ignore */ }
    setShowDocPicker(false)
  }

  async function handleUploadKnowledgeFile(file: File) {
    if (!agentId) return
    setDocUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/agents/${agentId}/knowledge/documents`, { method: 'POST', body: formData })
      if (res.ok) {
        const json = await res.json()
        setKnowledgeDocs(prev => [json.data, ...prev])
      }
    } finally { setDocUploading(false) }
  }

  async function loadAvailableDocs() {
    const res = await fetch('/api/documents')
    if (res.ok) {
      const json = await res.json()
      setAvailableDocs((json.data ?? []).map((d: { id: string; title: string; document_type: string }) => ({
        id: d.id, title: d.title, document_type: d.document_type,
      })))
    }
    setShowDocPicker(true)
  }

  async function handleSave() {
    if (!name.trim()) { setToast('Agent name is required'); return }
    setSaving(true)
    try {
      const payload = {
        name:               name.trim(),
        description:        description.trim() || null,
        avatar_color:       avatarColor,
        avatar_preset:      avatarPreset,
        avatar_url:         avatarUrl,
        visibility,
        model,
        model_provider:     modelProvider,
        model_name:         modelName,
        model_api_key:      modelApiKey.trim() || null,
        model_config_id:    modelConfigId,
        ai_provider:        aiProvider,
        ai_model:           aiModel,
        persona_preset:     personaPreset,
        persona:            persona.trim() || null,
        instructions:       instructions.trim() || null,
        tools,
        company_scope:      allCompanies ? [] : companyScopeIds,
        email_address:      emailAddress.trim() || null,
        email_display_name: emailDisplayName.trim() || null,
        email_recipients:   emailRecipients.split(',').map(e => e.trim()).filter(Boolean),
        slack_channel:      slackChannel.trim() || null,
        notify_on_completion: notifyOnCompletion,
        notify_on_output:     notifyOnOutput,
        notify_email:         notifyEmail.trim()  || null,
        notify_slack_channel: notifySlack.trim()  || null,
      }

      let res: Response
      if (mode === 'create') {
        res = await fetch('/api/agents', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/agents/${agentId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
      }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      setToast('Agent saved')
      showSaved()
      if (mode === 'create') router.push('/agents')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddCredential() {
    if (!agentId || !credName || !credKey || !credValue) {
      setToast('Name, key and value are required')
      return
    }
    setCredSaving(true)
    try {
      const res  = await fetch(`/api/agents/${agentId}/credentials`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: credName, key: credKey, value: credValue, description: credDesc || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save credential')
      setCreds(cs => [json.data, ...cs])
      setCredName(''); setCredKey(''); setCredValue(''); setCredDesc('')
      setToast('Credential saved')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to save credential')
    } finally {
      setCredSaving(false)
    }
  }

  async function handleDeleteCredential(credId: string) {
    if (!agentId) return
    try {
      const res  = await fetch(`/api/agents/${agentId}/credentials/${credId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to delete')
      setCreds(cs => cs.filter(c => c.id !== credId))
      setDeleteCredConfirm(null)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to delete credential')
      setDeleteCredConfirm(null)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const emailEnabled = tools.includes('send_email')
  const slackEnabled = tools.includes('send_slack')

  const initials = name.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'AI'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/agents"><ArrowLeft className="h-4 w-4 mr-1" /> Agents</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{mode === 'create' ? 'New Agent' : `Edit: ${name || 'Agent'}`}</h1>
        </div>
        {/* Avatar preview */}
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold text-white"
          style={{ backgroundColor: avatarColor }}
        >
          {initials}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
          toast.includes('saved') || toast.includes('Saved')
            ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            : 'bg-destructive/10 text-destructive border border-destructive/20'
        )}>
          {(toast.includes('saved') || toast.includes('Saved')) && <Check className="h-4 w-4" />}
          {toast}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b">
        {(['Identity', 'Behaviour', 'Access', 'Knowledge', 'Credentials', 'Notifications'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => void handleTabChange(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t}
            {t === 'Credentials' && mode === 'create' && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">After save</Badge>
            )}
          </button>
        ))}
        {/* Save indicator — fills the empty right side of the tab bar */}
        <div className="ml-auto pr-2 pb-1.5">
          {saving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          )}
          {!saving && savedRecently && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* ═════ TAB: Identity ═════ */}
      {tab === 'Identity' && (
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base">Identity</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Financial Reporter" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="A brief description of what this agent does..."
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label>Avatar</Label>
                <div className="flex items-center gap-4">
                  {/* Preview */}
                  <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 border-2 border-border"
                    style={{ backgroundColor: avatarColor + '20' }}>
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : avatarPreset ? (
                      <span className="text-3xl">{AVATAR_PRESETS.find(p => p.key === avatarPreset)?.emoji ?? '🤖'}</span>
                    ) : (
                      <span className="text-lg font-bold" style={{ color: avatarColor }}>{name.slice(0, 2).toUpperCase() || 'AG'}</span>
                    )}
                  </div>
                  {/* Presets */}
                  <div className="flex flex-wrap gap-1.5">
                    {AVATAR_PRESETS.map(p => (
                      <button key={p.key} type="button"
                        onClick={async () => {
                          setAvatarPreset(p.key)
                          setAvatarUrl(null)
                          if (agentId) {
                            await fetch(`/api/agents/${agentId}`, {
                              method:  'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body:    JSON.stringify({ avatar_preset: p.key, avatar_url: null }),
                            })
                            showSaved()
                          }
                        }}
                        className={cn('w-9 h-9 rounded-full flex items-center justify-center text-lg border-2 transition-all',
                          avatarPreset === p.key ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-muted-foreground/30'
                        )}>
                        {p.emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="color" value={avatarColor}
                    onChange={e => {
                      const newColor = e.target.value
                      setAvatarColor(newColor)
                      if (agentId) {
                        if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current)
                        colorSaveTimer.current = setTimeout(async () => {
                          await fetch(`/api/agents/${agentId}`, {
                            method:  'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body:    JSON.stringify({ avatar_color: newColor }),
                          })
                          showSaved()
                        }, 500)
                      }
                    }}
                    className="h-7 w-10 rounded border border-input cursor-pointer" />
                  <span className="text-xs text-muted-foreground">Colour accent</span>
                  <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) void handleAvatarUpload(e.target.files[0]); e.target.value = '' }} />
                  <Button variant="outline" size="sm" type="button" onClick={() => avatarInputRef.current?.click()}>
                    Upload Image
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Model</CardTitle>
              <CardDescription>
                Select a provider and model.{' '}
                <Link href="/settings?tab=agents" className="text-primary hover:underline">Manage provider keys in Settings →</Link>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {configuredProviders.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/30 px-4 py-5 text-sm text-muted-foreground space-y-2">
                  <p>No providers configured for this group yet.</p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/settings?tab=agents">Configure a provider in Settings →</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Provider</Label>
                    <select
                      value={aiProvider}
                      onChange={e => setAiProvider(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm capitalize"
                    >
                      {configuredProviders.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Model</Label>
                    {loadingModels ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading models…
                      </div>
                    ) : availableModels.length > 0 ? (
                      <>
                        <select
                          value={availableModels.find(m => m.id === aiModel) ? aiModel : ''}
                          onChange={e => setAiModel(e.target.value)}
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {availableModels.map(m => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                          <option value="">— Custom (enter below) —</option>
                        </select>
                        {!availableModels.find(m => m.id === aiModel) && (
                          <Input
                            value={aiModel}
                            onChange={e => setAiModel(e.target.value)}
                            placeholder="custom-model-name"
                            className="font-mono text-xs"
                          />
                        )}
                      </>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {configuredProviders.includes(aiProvider)
                            ? 'Could not load models — enter a model name manually.'
                            : 'Select a configured provider first.'}
                        </p>
                        <Input
                          value={aiModel}
                          onChange={e => setAiModel(e.target.value)}
                          placeholder="Enter model name manually"
                          className="font-mono text-xs"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => void handleTabChange('Behaviour')} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : 'Save & Continue →'}
            </Button>
          </div>
        </div>
      )}

      {/* ═════ TAB: Behaviour ═════ */}
      {tab === 'Behaviour' && (
        <div className="space-y-5">
          {/* Visibility toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div>
              <p className="text-sm font-medium">Agent Visibility</p>
              <p className="text-xs text-muted-foreground">
                {visibility === 'public' ? 'All users with Agents access can see and run this agent' : 'Only you can see and run this agent'}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Private</span>
              <button type="button" role="switch" aria-checked={visibility === 'public'}
                onClick={() => setVisibility(visibility === 'public' ? 'private' : 'public')}
                className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
                  visibility === 'public' ? 'bg-primary' : 'bg-input')}>
                <span className={cn('pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition-transform',
                  visibility === 'public' ? 'translate-x-4' : 'translate-x-0')} />
              </button>
              <span>Public</span>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Persona</CardTitle>
              <CardDescription>How the agent communicates and presents information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {PERSONA_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handlePersonaPresetSelect(opt.value)}
                    className={cn(
                      'p-3 rounded-lg border-2 text-left transition-all',
                      personaPreset === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/40'
                    )}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-semibold">{opt.label}</p>
                      {personaPreset === opt.value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{opt.description}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label>Persona instructions {personaPreset !== 'custom' && <span className="text-muted-foreground text-xs">(from preset — editable)</span>}</Label>
                <textarea
                  value={persona}
                  onChange={e => setPersona(e.target.value)}
                  placeholder="Describe how this agent should communicate..."
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => void handleTabChange('Identity')}>← Identity</Button>
            <Button onClick={() => void handleTabChange('Access')} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : 'Save & Continue →'}
            </Button>
          </div>
        </div>
      )}

      {/* ═════ TAB: Knowledge ═════ */}
      {tab === 'Knowledge' && (
        <div className="space-y-4">
          {mode === 'create' && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Save the agent first, then add knowledge on this tab.
              </CardContent>
            </Card>
          )}

          {mode === 'edit' && (
            <>
              {/* Background Knowledge */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Background Knowledge</CardTitle>
                  <CardDescription>Provide context, background information and domain knowledge this agent should always have available.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <textarea value={knowledgeText} onChange={e => setKnowledgeText(e.target.value)} rows={6}
                    className="w-full resize-y rounded-md border border-input bg-transparent p-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="E.g. Our financial year runs July–June…" />
                  <div className="flex items-center justify-end gap-2">
                    {knowledgeSaved && <span className="text-xs text-green-600">Saved ✓</span>}
                    <Button size="sm" onClick={saveKnowledgeText} disabled={saving}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Save
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Reference Documents */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-base">Reference Documents</CardTitle>
                      <CardDescription>Documents this agent can reference. Content is included in context.</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void loadAvailableDocs()}>
                        <FileText className="h-3.5 w-3.5" /> Link from Documents
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5" disabled={docUploading}
                        onClick={() => { const i = document.createElement('input'); i.type='file'; i.accept='.pdf,.docx,.doc,.txt,.md,.csv,.xlsx,.xls,.png,.jpg,.jpeg'; i.onchange=()=>{if(i.files?.[0])void handleUploadKnowledgeFile(i.files[0])}; i.click() }}>
                        <Upload className="h-3.5 w-3.5" /> {docUploading ? 'Uploading…' : 'Upload File'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {knowledgeDocs.length > 0 ? (
                    <div className="divide-y divide-border rounded-md border overflow-hidden">
                      {knowledgeDocs.map(kd => (
                        <div key={kd.id} className="flex items-center gap-3 px-3 py-2.5 bg-background">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{kd.document_title ?? kd.file_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">{kd.file_type ?? 'document'}</span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0">{kd.document_id ? 'From Documents' : 'Uploaded'}</Badge>
                            </div>
                          </div>
                          <button onClick={() => void handleRemoveKnowledgeDoc(kd.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">No reference documents added yet.</p>
                  )}
                </CardContent>
              </Card>

              {/* Document Picker Modal */}
              {showDocPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                  <div className="bg-background border rounded-xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col">
                    <div className="px-4 py-3 border-b flex items-center justify-between">
                      <h3 className="font-semibold text-sm">Link a Document</h3>
                      <button onClick={() => setShowDocPicker(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
                    </div>
                    <div className="px-4 py-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input value={docSearch} onChange={e => setDocSearch(e.target.value)} placeholder="Search documents…" className="pl-8 text-sm" />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 pb-2">
                      {availableDocs.filter(d => !docSearch || d.title.toLowerCase().includes(docSearch.toLowerCase())).map(d => (
                        <button key={d.id} onClick={() => void handleLinkDocument(d.id)}
                          className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-sm">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate flex-1">{d.title}</span>
                          <Badge variant="outline" className="text-[9px] shrink-0">{d.document_type}</Badge>
                        </button>
                      ))}
                      {availableDocs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No documents available.</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Reference Links */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Reference Links</CardTitle>
                      <CardDescription>Web links included as reference URLs in agent context.</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={() => { setEditingLinkIdx(null); setNewLinkUrl(''); setNewLinkLabel(''); setNewLinkDesc(''); setShowLinkForm(true) }}>
                      <Plus className="h-3.5 w-3.5" /> Add Link
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {showLinkForm && (
                    <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                      <Input value={newLinkLabel} onChange={e => setNewLinkLabel(e.target.value)} placeholder="Label" className="text-sm" />
                      <Input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)} placeholder="https://…" className="text-sm" />
                      <Input value={newLinkDesc} onChange={e => setNewLinkDesc(e.target.value)} placeholder="Description (optional)" className="text-sm" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleAddLink} disabled={!newLinkUrl.trim()}>{editingLinkIdx !== null ? 'Update' : 'Add'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setShowLinkForm(false); setEditingLinkIdx(null) }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                  {knowledgeLinks.length > 0 ? (
                    <div className="divide-y divide-border rounded-md border overflow-hidden">
                      {knowledgeLinks.map((link, idx) => (
                        <div key={idx} className="flex items-start gap-3 px-3 py-2.5 bg-background">
                          <Link2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{link.label || link.url}</p>
                            <p className="text-xs text-muted-foreground truncate">{link.url}</p>
                            {link.description && <p className="text-xs text-muted-foreground mt-0.5">{link.description}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => handleEditLink(idx)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => handleRemoveLink(idx)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !showLinkForm ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No reference links added yet.</p>
                  ) : null}
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => void handleTabChange('Access')}>← Access</Button>
                <Button onClick={() => void handleTabChange('Credentials')} disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : 'Save & Continue →'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═════ TAB: Access ═════ */}
      {tab === 'Access' && (
        <div className="space-y-5">
          {/* Feature × Company Access Matrix */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company &amp; Feature Access</CardTitle>
              <CardDescription>
                Control which features this agent can access, and at what level, per company.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Mode selector */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio" name="access-mode"
                    checked={accessMode === 'all'}
                    onChange={() => { setAccessMode('all'); setAll('write') }}
                  />
                  <span className="text-sm">All companies &mdash; full access to all features</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio" name="access-mode"
                    checked={accessMode === 'specific'}
                    onChange={() => setAccessMode('specific')}
                  />
                  <span className="text-sm">Specific access per feature and company</span>
                </label>
              </div>

              {accessMode === 'specific' && companies.length > 0 && (
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground min-w-[140px]">Feature</th>
                        <th className="text-center px-2 py-2 font-medium text-muted-foreground min-w-[100px]">All companies</th>
                        {companies.map(c => (
                          <th key={c.id} className="text-center px-2 py-2 font-medium text-muted-foreground min-w-[100px] truncate max-w-[120px]">
                            {c.name}
                          </th>
                        ))}
                      </tr>
                      {/* Column setter row */}
                      <tr className="border-t bg-muted/20">
                        <td className="px-3 py-1.5 text-xs text-muted-foreground italic">All features</td>
                        <td className="px-2 py-1.5 text-center">
                          <select
                            value=""
                            onChange={e => { if (e.target.value) setAll(e.target.value as CompanyAccessLevel) }}
                            className="h-7 rounded border text-xs px-1 w-24 bg-background text-foreground border-border"
                          >
                            <option value="">Set all…</option>
                            <option value="none">None</option>
                            <option value="read">Read</option>
                            <option value="write">Write</option>
                          </select>
                        </td>
                        {companies.map(c => (
                          <td key={c.id} className="px-2 py-1.5 text-center">
                            <select
                              value=""
                              onChange={e => { if (e.target.value) setColumn(c.id, e.target.value as CompanyAccessLevel) }}
                              className="h-7 rounded border text-xs px-1 w-24 bg-background text-foreground border-border"
                            >
                              <option value="">Set…</option>
                              <option value="none">None</option>
                              <option value="read">Read</option>
                              <option value="write">Write</option>
                            </select>
                          </td>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ACCESS_FEATURES.map(feature => {
                        const row = accessMatrix[feature] ?? {}
                        const defaultLevel = row['default'] ?? 'none'
                        return (
                          <tr key={feature} className="hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium text-foreground">{ACCESS_FEATURE_LABELS[feature]}</td>
                            {/* Row default setter */}
                            <td className="px-2 py-2 text-center">
                              <select
                                value={defaultLevel}
                                onChange={e => setRow(feature, e.target.value as CompanyAccessLevel)}
                                className={cn(
                                  'h-7 rounded border text-xs px-1 w-24',
                                  defaultLevel === 'write' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700' :
                                  defaultLevel === 'read'  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700' :
                                                              'bg-muted text-muted-foreground border-border',
                                )}
                              >
                                <option value="none">None</option>
                                <option value="read">Read</option>
                                <option value="write">Write</option>
                              </select>
                            </td>
                            {companies.map(c => {
                              const cellLevel = row[c.id] ?? defaultLevel
                              return (
                                <td key={c.id} className="px-2 py-2 text-center">
                                  <select
                                    value={cellLevel}
                                    onChange={e => setCell(feature, c.id, e.target.value as CompanyAccessLevel)}
                                    className={cn(
                                      'h-7 rounded border text-xs px-1 w-24',
                                      cellLevel === 'write' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700' :
                                      cellLevel === 'read'  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700' :
                                                               'bg-muted text-muted-foreground border-border',
                                    )}
                                  >
                                    <option value="none">None</option>
                                    <option value="read">Read</option>
                                    <option value="write">Write</option>
                                  </select>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded bg-green-200 dark:bg-green-800 border border-green-400" />
                    Write
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded bg-blue-200 dark:bg-blue-800 border border-blue-400" />
                    Read
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded bg-muted border border-border" />
                    None
                  </span>
                </div>
                {agentId && (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => void saveCompanyAccess()}
                    disabled={accessSaving || accessLoading}
                    className="gap-1.5"
                  >
                    {accessSaving
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                      : <><Check className="h-3.5 w-3.5" /> Save Access</>}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Email config */}
          {emailEnabled && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Email Configuration</CardTitle>
                <CardDescription>How this agent sends emails via Resend</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Email address prefix</Label>
                  <div className="flex items-center">
                    <Input
                      value={emailAddress}
                      onChange={e => setEmailAddress(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="monthly-reporter"
                      className="rounded-r-none"
                    />
                    <span className="h-9 px-3 flex items-center text-sm border border-l-0 rounded-r-md bg-muted text-muted-foreground">
                      @navhub.co
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Display name</Label>
                  <Input value={emailDisplayName} onChange={e => setEmailDisplayName(e.target.value)} placeholder="Monthly Reporter" />
                </div>
                <div className="space-y-1.5">
                  <Label>Default recipients <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
                  <Input value={emailRecipients} onChange={e => setEmailRecipients(e.target.value)} placeholder="ceo@example.com, cfo@example.com" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Slack config */}
          {slackEnabled && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Slack Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <Label>Channel override</Label>
                  <Input value={slackChannel} onChange={e => setSlackChannel(e.target.value)} placeholder="#finance (uses group default if blank)" />
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => void handleTabChange('Behaviour')}>← Behaviour</Button>
            {mode === 'edit'
              ? <Button onClick={() => void handleTabChange('Credentials')} disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : 'Save & Continue →'}
                </Button>
              : <Button onClick={handleSave} disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : 'Create Agent'}
                </Button>
            }
          </div>
        </div>
      )}

      {/* ═════ TAB: Credentials ═════ */}
      {tab === 'Credentials' && (
        <div className="space-y-5">
          {mode === 'create' ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Save the agent first, then add credentials on this tab.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Stored Credentials</CardTitle>
                  <CardDescription>
                    Values are encrypted and cannot be retrieved once saved.
                    To update a value, revoke and add a new credential.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {creds.length === 0 ? (
                    <p className="px-6 py-4 text-sm text-muted-foreground">No credentials stored yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {creds.map(cred => (
                        <li key={cred.id} className="flex items-center gap-3 px-6 py-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{cred.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {cred.key} · {cred.last_used_at ? `Last used ${new Date(cred.last_used_at).toLocaleDateString()}` : 'Never used'}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">••••••••</span>
                          {deleteCredConfirm === cred.id ? (
                            <span className="flex gap-1">
                              <Button size="sm" variant="destructive" className="h-7 text-xs px-2" onClick={() => void handleDeleteCredential(cred.id)}>Confirm</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setDeleteCredConfirm(null)}>Cancel</Button>
                            </span>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive" onClick={() => setDeleteCredConfirm(cred.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Add Credential</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Display name</Label>
                      <Input value={credName} onChange={e => setCredName(e.target.value)} placeholder="OpenAI API Key" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Key</Label>
                      <Input
                        value={credKey}
                        onChange={e => setCredKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                        placeholder="OPENAI_API_KEY"
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Value</Label>
                    <div className="flex gap-2">
                      <Input
                        type={credShow ? 'text' : 'password'}
                        value={credValue}
                        onChange={e => setCredValue(e.target.value)}
                        placeholder="sk-..."
                        className="flex-1 font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCredShow(s => !s)}
                        className="h-9 w-9 p-0"
                      >
                        {credShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input value={credDesc} onChange={e => setCredDesc(e.target.value)} placeholder="Used for GPT-4o runs" />
                  </div>
                  <Button size="sm" onClick={handleAddCredential} disabled={credSaving}>
                    {credSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                    Save credential
                  </Button>
                </CardContent>
              </Card>

              <Separator />
            </>
          )}

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={() => void handleTabChange('Access')}>← Access</Button>
            <Button onClick={() => void handleTabChange('Notifications')} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : 'Save & Continue →'}
            </Button>
          </div>
        </div>
      )}

      {/* ═════ TAB: Notifications ═════ */}
      {tab === 'Notifications' && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run Completion</CardTitle>
              <CardDescription>Notify when this agent finishes a run.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyOnCompletion}
                  onChange={e => setNotifyOnCompletion(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Send notification when this agent finishes a run</span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Output Created</CardTitle>
              <CardDescription>Notify when this agent creates a document or report.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyOnOutput}
                  onChange={e => setNotifyOnOutput(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Send notification when agent creates a document or report</span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recipients</CardTitle>
              <CardDescription>Where notifications are sent. Both triggers share these recipients.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  value={notifyEmail}
                  onChange={e => setNotifyEmail(e.target.value)}
                  placeholder="recipient@company.com"
                />
                <p className="text-xs text-muted-foreground">Comma-separated for multiple recipients.</p>
              </div>

              <div className="space-y-1.5">
                <Label>Slack channel</Label>
                <Input
                  value={notifySlack}
                  onChange={e => setNotifySlack(e.target.value)}
                  placeholder="#channel-name"
                  disabled={!slackStatus.connected}
                />
                {slackStatus.connected ? (
                  <p className="text-xs text-muted-foreground">
                    Connected to <span className="font-medium text-foreground">{slackStatus.team_name ?? 'Slack workspace'}</span>.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Slack not connected —{' '}
                    <Link href="/integrations" className="text-primary hover:underline">Connect in Integrations →</Link>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={() => void handleTabChange('Credentials')}>← Credentials</Button>
            <Button onClick={async () => { await handleSave(); router.push('/agents') }} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : <><Check className="h-4 w-4 mr-1.5" /> Save & Close</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
