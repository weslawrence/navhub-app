'use client'

import { useState, useEffect, useCallback } from 'react'
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
  MODEL_OPTIONS, PERSONA_PRESETS,
  type Agent, type AgentModel, type AgentTool, type PersonaPreset,
  type AgentCredential, type Company, type KnowledgeLink, type AgentKnowledgeDocument,
} from '@/lib/types'

// ─── Tool display config ──────────────────────────────────────────────────────

const TOOL_OPTIONS: {
  value: AgentTool
  label: string
  emoji: string
  description: string
}[] = [
  { value: 'read_financials',        label: 'Read Financials',       emoji: '📊', description: 'Access P&L and balance sheet data' },
  { value: 'read_companies',         label: 'Read Companies',        emoji: '🏢', description: 'Access company and division info' },
  { value: 'generate_report',        label: 'Generate Report',       emoji: '📄', description: 'Create draft reports in the library' },
  { value: 'send_slack',             label: 'Send to Slack',         emoji: '💬', description: 'Post output to a Slack channel' },
  { value: 'send_email',             label: 'Send Email',            emoji: '📧', description: 'Send output via email (Resend)' },
  { value: 'list_report_templates',  label: 'List Templates',        emoji: '📋', description: 'List available report templates' },
  { value: 'read_report_template',   label: 'Read Template',         emoji: '🔍', description: 'Fetch template definition and slots' },
  { value: 'create_report_template', label: 'Create Template',       emoji: '✨', description: 'Create a new report template' },
  { value: 'update_report_template', label: 'Update Template',       emoji: '✏️', description: 'Edit an existing template (auto-versions)' },
  { value: 'render_report',          label: 'Render Report',         emoji: '🖨️', description: 'Fill a template and save to Reports Library' },
  { value: 'analyse_document',       label: 'Analyse Document',      emoji: '🔎', description: 'Extract a template proposal from a document' },
  { value: 'list_documents',         label: 'List Documents',        emoji: '📂', description: 'List documents in the Documents section' },
  { value: 'read_document',          label: 'Read Document',         emoji: '📖', description: 'Read the full content of a document' },
  { value: 'create_document',        label: 'Create Document',       emoji: '📝', description: 'Create and save a new document' },
  { value: 'update_document',          label: 'Update Document',       emoji: '✍️', description: 'Update an existing document (auto-versions)' },
  { value: 'read_cashflow',            label: 'Read Cash Flow',        emoji: '💰', description: 'Read the 13-week rolling cash flow forecast' },
  { value: 'read_cashflow_items',      label: 'Read CF Items',         emoji: '🗂️', description: 'List recurring and one-off cash flow line items' },
  { value: 'suggest_cashflow_item',    label: 'Suggest CF Item',       emoji: '💡', description: 'Suggest a new cash flow line item for review' },
  { value: 'update_cashflow_item',     label: 'Update CF Item',        emoji: '✅', description: 'Accept, update, or deactivate a cash flow item' },
  { value: 'create_cashflow_snapshot', label: 'Create CF Snapshot',    emoji: '📸', description: 'Save a named point-in-time cash flow snapshot' },
  { value: 'summarise_cashflow',       label: 'Summarise Cash Flow',   emoji: '🤖', description: 'AI executive summary with risks and recommendations' },
  { value: 'read_marketing_data',      label: 'Marketing Data',        emoji: '📊', description: 'Fetch web, social, ads, and email marketing metrics' },
  { value: 'summarise_marketing',      label: 'Summarise Marketing',   emoji: '📈', description: 'AI-powered marketing performance summary with trends and recommendations' },
  { value: 'ask_user',                 label: 'Ask User',              emoji: '❓', description: 'Pause and ask the user a clarifying question (always enabled)' },
  { value: 'read_attachment',          label: 'Read Attachment',        emoji: '📎', description: 'Read the content of files attached to a run' },
]

const PERSONA_OPTIONS: { value: PersonaPreset; label: string; description: string }[] = [
  { value: 'executive_analyst',    label: 'Executive Analyst',    description: 'Formal, concise — for C-suite audiences' },
  { value: 'business_writer',      label: 'Business Writer',      description: 'Clear prose, narrative-driven reporting' },
  { value: 'operations_assistant', label: 'Operations Assistant', description: 'Practical, bullet-points, action-focused' },
  { value: 'custom',               label: 'Custom',               description: 'Write your own persona instructions' },
]

type Tab = 'Identity' | 'Behaviour' | 'Knowledge' | 'Tools' | 'Credentials'

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
  const [model,            setModel]            = useState<AgentModel>('claude-sonnet-4-20250514')
  const [personaPreset,    setPersonaPreset]    = useState<PersonaPreset>('custom')
  const [persona,          setPersona]          = useState('')
  const [instructions,     setInstructions]     = useState('')
  const [tools,            setTools]            = useState<AgentTool[]>([])
  const [allCompanies,     setAllCompanies]     = useState(true)  // true = all companies in scope
  const [companyScopeIds,  setCompanyScopeIds]  = useState<string[]>([])
  const [emailAddress,     setEmailAddress]     = useState('')
  const [emailDisplayName, setEmailDisplayName] = useState('')
  const [emailRecipients,  setEmailRecipients]  = useState('')  // comma-separated
  const [slackChannel,     setSlackChannel]     = useState('')

  // ── UI state ──────────────────────────────────────────────────────────────
  const [companies,  setCompanies]  = useState<Company[]>([])
  const [creds,      setCreds]      = useState<AgentCredential[]>([])
  const [saving,     setSaving]     = useState(false)
  const [toast,      setToast]      = useState<string | null>(null)
  const [loading,    setLoading]    = useState(mode === 'edit')

  // Credential form
  const [credName,   setCredName]   = useState('')
  const [credKey,    setCredKey]    = useState('')
  const [credValue,  setCredValue]  = useState('')
  const [credDesc,   setCredDesc]   = useState('')
  const [credShow,   setCredShow]   = useState(false)
  const [credSaving, setCredSaving] = useState(false)
  const [deleteCredConfirm, setDeleteCredConfirm] = useState<string | null>(null)

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
  }, [])

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
      setModel(a.model)
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

  function toggleTool(tool: AgentTool) {
    setTools(prev =>
      prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]
    )
  }

  function toggleScopeCompany(id: string) {
    setCompanyScopeIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

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
      setTimeout(() => setKnowledgeSaved(false), 2000)
    } finally { setSaving(false) }
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
        model,
        persona_preset:     personaPreset,
        persona:            persona.trim() || null,
        instructions:       instructions.trim() || null,
        tools,
        company_scope:      allCompanies ? [] : companyScopeIds,
        email_address:      emailAddress.trim() || null,
        email_display_name: emailDisplayName.trim() || null,
        email_recipients:   emailRecipients.split(',').map(e => e.trim()).filter(Boolean),
        slack_channel:      slackChannel.trim() || null,
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
      <div className="flex gap-1 border-b">
        {(['Identity', 'Behaviour', 'Knowledge', 'Tools', 'Credentials'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
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
              <div className="space-y-1.5">
                <Label>Avatar colour</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={avatarColor}
                    onChange={e => setAvatarColor(e.target.value)}
                    className="h-9 w-16 rounded-md border border-input cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground font-mono">{avatarColor}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Model</CardTitle>
              <CardDescription>The AI model that powers this agent</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {MODEL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setModel(opt.value)}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border-2 transition-all',
                    model === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{opt.label}</span>
                        <Badge
                          variant={opt.tier === 'advanced' ? 'default' : opt.tier === 'external' ? 'outline' : 'secondary'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {opt.tier}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                    </div>
                    {model === opt.value && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => setTab('Behaviour')}>Next: Behaviour →</Button>
          </div>
        </div>
      )}

      {/* ═════ TAB: Behaviour ═════ */}
      {tab === 'Behaviour' && (
        <div className="space-y-5">
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Task Instructions</CardTitle>
              <CardDescription>What should this agent do on each run?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder="Describe what this agent should do...&#10;&#10;Example: Analyse the P&L for each company for the current month. Identify the top 3 revenue drivers and any expenses that are higher than last quarter. Summarise your findings in an executive brief."
                rows={7}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company Scope</CardTitle>
              <CardDescription>Which companies can this agent access?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allCompanies}
                  onChange={e => setAllCompanies(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">All companies in group</span>
              </label>
              {!allCompanies && companies.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-md border p-2">
                  {companies.map(company => (
                    <label key={company.id} className="flex items-center gap-2 cursor-pointer px-1">
                      <input
                        type="checkbox"
                        checked={companyScopeIds.includes(company.id)}
                        onChange={() => toggleScopeCompany(company.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{company.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setTab('Identity')}>← Identity</Button>
            <Button onClick={() => setTab('Knowledge')}>Next: Knowledge →</Button>
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
                <Button variant="outline" onClick={() => setTab('Behaviour')}>← Behaviour</Button>
                <div className="flex gap-2">
                  <Button onClick={saveKnowledgeAll} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : knowledgeSaved ? <Check className="h-4 w-4" /> : null}
                    {knowledgeSaved ? 'Saved' : 'Save Knowledge'}
                  </Button>
                  <Button onClick={() => setTab('Tools')}>Next: Tools →</Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═════ TAB: Tools ═════ */}
      {tab === 'Tools' && (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enabled Tools</CardTitle>
              <CardDescription>What capabilities does this agent have?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {TOOL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleTool(opt.value)}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border-2 transition-all flex items-center gap-3',
                    tools.includes(opt.value)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40'
                  )}
                >
                  <span className="text-xl">{opt.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                  {tools.includes(opt.value) && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              ))}
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
            <Button variant="outline" onClick={() => setTab('Behaviour')}>← Behaviour</Button>
            {mode === 'edit'
              ? <Button onClick={() => setTab('Credentials')}>Next: Credentials →</Button>
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
            <Button variant="outline" onClick={() => setTab('Tools')}>← Tools</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : <><Check className="h-4 w-4 mr-1.5" /> Save agent</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
