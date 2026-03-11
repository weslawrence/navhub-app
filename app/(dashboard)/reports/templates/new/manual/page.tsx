'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter }                   from 'next/navigation'
import Link                            from 'next/link'
import { ChevronLeft, Plus, Trash2, Loader2 } from 'lucide-react'
import { Card, CardContent }           from '@/components/ui/card'
import { Badge }                       from '@/components/ui/badge'
import { cn }                          from '@/lib/utils'
import type { SlotDefinition, TemplateType, SlotType, SlotDataSource } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateForm {
  name:               string
  template_type:      TemplateType
  description:        string
  agent_instructions: string
  slots:              SlotDefinition[]
  design_tokens:      Record<string, string>
  scaffold_html:      string
  scaffold_css:       string
  scaffold_js:        string
}

const EMPTY_FORM: TemplateForm = {
  name:               '',
  template_type:      'narrative',
  description:        '',
  agent_instructions: '',
  slots:              [],
  design_tokens:      {},
  scaffold_html:      '',
  scaffold_css:       '',
  scaffold_js:        '',
}

const EMPTY_SLOT: SlotDefinition = {
  name:        '',
  label:       '',
  type:        'text',
  description: '',
  required:    true,
  data_source: 'manual',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManualTemplatePage() {
  const router = useRouter()

  const [form,      setForm]      = useState<TemplateForm>(EMPTY_FORM)
  const [tab,       setTab]       = useState<'details' | 'slots' | 'tokens' | 'scaffold'>('details')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [slotModal, setSlotModal] = useState<{ open: boolean; index: number | null; slot: SlotDefinition }>({
    open: false, index: null, slot: { ...EMPTY_SLOT },
  })
  const [newTokenKey,   setNewTokenKey]   = useState('')
  const [newTokenValue, setNewTokenValue] = useState('')
  const [previewHtml,   setPreviewHtml]   = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Load prefill from sessionStorage (from review page)
  useEffect(() => {
    const raw = sessionStorage.getItem('template_prefill')
    if (raw) {
      try {
        const prefill = JSON.parse(raw) as Partial<TemplateForm>
        setForm(f => ({ ...f, ...prefill }))
        sessionStorage.removeItem('template_prefill')
      } catch { /* ignore */ }
    }
  }, [])

  function update<K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  // ── Slot modal ──

  function openAddSlot() {
    setSlotModal({ open: true, index: null, slot: { ...EMPTY_SLOT } })
  }

  function openEditSlot(i: number) {
    setSlotModal({ open: true, index: i, slot: { ...form.slots[i] } })
  }

  function saveSlot() {
    const s = slotModal.slot
    if (!s.name.trim() || !s.label.trim()) return
    setForm(f => {
      const slots = [...f.slots]
      if (slotModal.index !== null) {
        slots[slotModal.index] = s
      } else {
        slots.push(s)
      }
      return { ...f, slots }
    })
    setSlotModal(m => ({ ...m, open: false }))
  }

  function removeSlot(i: number) {
    setForm(f => ({ ...f, slots: f.slots.filter((_, idx) => idx !== i) }))
  }

  // ── Design tokens ──

  function addToken() {
    const k = newTokenKey.trim()
    const v = newTokenValue.trim()
    if (!k || !v) return
    setForm(f => ({ ...f, design_tokens: { ...f.design_tokens, [k]: v } }))
    setNewTokenKey('')
    setNewTokenValue('')
  }

  function removeToken(key: string) {
    setForm(f => {
      const tokens = { ...f.design_tokens }
      delete tokens[key]
      return { ...f, design_tokens: tokens }
    })
  }

  // ── Scaffold preview ──

  function updatePreview() {
    // Build a simple preview by filling slot names as placeholders
    const slotData: Record<string, string> = {}
    form.slots.forEach(s => { slotData[s.name] = `[${s.label}]` })

    let html = form.scaffold_html
    for (const [k, v] of Object.entries(slotData)) {
      html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v)
    }
    let css = form.scaffold_css
    for (const [k, v] of Object.entries(form.design_tokens)) {
      css = css.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v)
    }
    setPreviewHtml(`<!DOCTYPE html><html><head><style>${css}</style></head><body>${html}<script>${form.scaffold_js}</script></body></html>`)
  }

  function injectSlotNames() {
    const comment = form.slots.map(s => `<!-- {{${s.name}}} — ${s.label} -->`).join('\n')
    update('scaffold_html', form.scaffold_html + '\n' + comment)
  }

  // ── Save ──

  async function handleSave() {
    if (!form.name.trim()) { setError('Template name is required'); return }
    if (!form.slots.length) { setError('At least one slot is required'); return }
    setSaving(true)
    setError(null)
    try {
      const res  = await fetch('/api/report-templates', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:               form.name,
          template_type:      form.template_type,
          description:        form.description || null,
          agent_instructions: form.agent_instructions || null,
          slots:              form.slots,
          design_tokens:      form.design_tokens,
          scaffold_html:      form.scaffold_html || null,
          scaffold_css:       form.scaffold_css  || null,
          scaffold_js:        form.scaffold_js   || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      router.push(`/reports/templates/${json.data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error saving template')
      setSaving(false)
    }
  }

  const TABS = [
    { key: 'details'  as const, label: 'Details'        },
    { key: 'slots'    as const, label: `Slots (${form.slots.length})`    },
    { key: 'tokens'   as const, label: `Design Tokens (${Object.keys(form.design_tokens).length})` },
    { key: 'scaffold' as const, label: 'Scaffold'       },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/reports/templates/new" className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Build Template Manually</h1>
            <p className="text-sm text-muted-foreground">Define all template fields yourself</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--palette-primary)' }}
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save Template'}
          </button>
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

      {/* ── Details tab ── */}
      {tab === 'details' && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <Field label="Template Name *">
              <input
                value={form.name}
                onChange={e => update('name', e.target.value)}
                placeholder="e.g. Monthly P&L Summary"
                className="w-full text-sm rounded-md border bg-background px-3 py-2 text-foreground"
              />
            </Field>

            <Field label="Template Type">
              <select
                value={form.template_type}
                onChange={e => update('template_type', e.target.value as TemplateType)}
                className="w-full text-sm rounded-md border bg-background px-3 py-2 text-foreground"
              >
                <option value="financial">Financial</option>
                <option value="matrix">Matrix</option>
                <option value="narrative">Narrative</option>
                <option value="dashboard">Dashboard</option>
                <option value="workflow">Workflow</option>
              </select>
            </Field>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={e => update('description', e.target.value)}
                placeholder="What is this template for?"
                rows={3}
                className="w-full text-sm rounded-md border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none"
              />
            </Field>

            <Field label="Agent Instructions">
              <textarea
                value={form.agent_instructions}
                onChange={e => update('agent_instructions', e.target.value)}
                placeholder="Instructions for AI agents generating content for this template…"
                rows={4}
                className="w-full text-sm rounded-md border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none font-mono text-xs"
              />
            </Field>
          </CardContent>
        </Card>
      )}

      {/* ── Slots tab ── */}
      {tab === 'slots' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {form.slots.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  No slots defined yet. Add your first slot below.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2.5 px-4 font-medium">Name</th>
                      <th className="text-left py-2.5 px-4 font-medium">Label</th>
                      <th className="text-left py-2.5 px-4 font-medium">Type</th>
                      <th className="text-left py-2.5 px-4 font-medium">Required</th>
                      <th className="text-left py-2.5 px-4 font-medium">Source</th>
                      <th className="py-2.5 px-4 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.slots.map((slot, i) => (
                      <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                        <td className="py-2.5 px-4 font-mono text-xs text-foreground">{slot.name}</td>
                        <td className="py-2.5 px-4 text-foreground">{slot.label}</td>
                        <td className="py-2.5 px-4">
                          <Badge variant="outline" className="text-xs">{slot.type}</Badge>
                        </td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground">{slot.required ? 'Yes' : 'No'}</td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground">{slot.data_source}</td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditSlot(i)}
                              className="px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground hover:text-foreground">Edit</button>
                            <button onClick={() => removeSlot(i)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <button
            onClick={openAddSlot}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Slot
          </button>
        </div>
      )}

      {/* ── Design Tokens tab ── */}
      {tab === 'tokens' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {Object.keys(form.design_tokens).length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  No design tokens defined yet.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2.5 px-4 font-medium w-8"></th>
                      <th className="text-left py-2.5 px-4 font-medium">Token name</th>
                      <th className="text-left py-2.5 px-4 font-medium">Value</th>
                      <th className="py-2.5 px-4 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(form.design_tokens).map(([key, value]) => {
                      const isColor = /^#[0-9a-fA-F]{3,8}$|^rgb|^hsl/.test(value)
                      return (
                        <tr key={key} className="border-b border-border/40 last:border-0">
                          <td className="py-2.5 px-4">
                            {isColor && (
                              <span className="w-5 h-5 rounded border border-border/50 block"
                                style={{ backgroundColor: value }} />
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground">{`{{${key}}}`}</td>
                          <td className="py-2.5 px-4">
                            <input
                              value={value}
                              onChange={e => {
                                const v = e.target.value
                                setForm(f => ({ ...f, design_tokens: { ...f.design_tokens, [key]: v } }))
                              }}
                              className="w-full text-xs font-mono rounded border bg-background px-2 py-1 text-foreground"
                            />
                          </td>
                          <td className="py-2.5 px-4">
                            <button onClick={() => removeToken(key)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <input
              value={newTokenKey}
              onChange={e => setNewTokenKey(e.target.value)}
              placeholder="token-name"
              className="flex-1 text-sm font-mono rounded-md border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
            />
            <input
              value={newTokenValue}
              onChange={e => setNewTokenValue(e.target.value)}
              placeholder="#0ea5e9"
              className="flex-1 text-sm font-mono rounded-md border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
            />
            <button
              onClick={addToken}
              disabled={!newTokenKey.trim() || !newTokenValue.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>
      )}

      {/* ── Scaffold tab ── */}
      {tab === 'scaffold' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Use <code className="font-mono bg-muted px-1 rounded">{`{{slot_name}}`}</code> in HTML and <code className="font-mono bg-muted px-1 rounded">{`{{token-name}}`}</code> in CSS.
            </p>
            <div className="flex gap-2">
              <button onClick={injectSlotNames}
                className="text-xs px-3 py-1.5 rounded border text-muted-foreground hover:text-foreground hover:bg-muted">
                Inject slot names
              </button>
              <button onClick={updatePreview}
                className="text-xs px-3 py-1.5 rounded border text-muted-foreground hover:text-foreground hover:bg-muted">
                Refresh preview
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <ScaffoldEditor
              label="HTML"
              value={form.scaffold_html}
              onChange={v => update('scaffold_html', v)}
              placeholder="<div>{{slot_name}}</div>"
            />
            <ScaffoldEditor
              label="CSS"
              value={form.scaffold_css}
              onChange={v => update('scaffold_css', v)}
              placeholder="body { background: {{bg-primary}}; }"
            />
            <ScaffoldEditor
              label="JS (optional)"
              value={form.scaffold_js}
              onChange={v => update('scaffold_js', v)}
              placeholder="// Optional interactive behaviour"
            />
          </div>

          {previewHtml && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Preview (slot values shown as placeholders)</p>
              <iframe
                ref={iframeRef}
                srcDoc={previewHtml}
                sandbox="allow-scripts allow-same-origin"
                className="w-full h-64 rounded-lg border bg-white"
                title="Template preview"
              />
            </div>
          )}
        </div>
      )}

      {/* ── Slot Modal ── */}
      {slotModal.open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border shadow-xl w-full max-w-md space-y-4 p-6">
            <h2 className="font-semibold text-foreground">
              {slotModal.index !== null ? 'Edit Slot' : 'Add Slot'}
            </h2>

            <div className="space-y-3">
              <Field label="Name (snake_case) *">
                <input
                  value={slotModal.slot.name}
                  onChange={e => setSlotModal(m => ({ ...m, slot: { ...m.slot, name: e.target.value.replace(/\s/g, '_').toLowerCase() } }))}
                  placeholder="e.g. company_name"
                  className="w-full text-sm font-mono rounded-md border bg-background px-3 py-2 text-foreground"
                />
              </Field>
              <Field label="Label *">
                <input
                  value={slotModal.slot.label}
                  onChange={e => setSlotModal(m => ({ ...m, slot: { ...m.slot, label: e.target.value } }))}
                  placeholder="e.g. Company Name"
                  className="w-full text-sm rounded-md border bg-background px-3 py-2 text-foreground"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select
                    value={slotModal.slot.type}
                    onChange={e => setSlotModal(m => ({ ...m, slot: { ...m.slot, type: e.target.value as SlotType } }))}
                    className="w-full text-sm rounded-md border bg-background px-3 py-2 text-foreground"
                  >
                    {(['text','html','number','table','list','date','color','object'] as SlotType[]).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Data Source">
                  <select
                    value={slotModal.slot.data_source}
                    onChange={e => setSlotModal(m => ({ ...m, slot: { ...m.slot, data_source: e.target.value as SlotDataSource } }))}
                    className="w-full text-sm rounded-md border bg-background px-3 py-2 text-foreground"
                  >
                    <option value="manual">Manual</option>
                    <option value="navhub_financial">NavHub Financial</option>
                    <option value="agent_provided">Agent Provided</option>
                    <option value="uploaded_file">Uploaded File</option>
                  </select>
                </Field>
              </div>
              <Field label="Description">
                <textarea
                  value={slotModal.slot.description}
                  onChange={e => setSlotModal(m => ({ ...m, slot: { ...m.slot, description: e.target.value } }))}
                  rows={2}
                  placeholder="What does this slot contain?"
                  className="w-full text-sm rounded-md border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={slotModal.slot.required}
                  onChange={e => setSlotModal(m => ({ ...m, slot: { ...m.slot, required: e.target.checked } }))}
                  className="rounded"
                />
                Required
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSlotModal(m => ({ ...m, open: false }))}
                className="px-4 py-2 rounded-md border text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={saveSlot}
                disabled={!slotModal.slot.name.trim() || !slotModal.slot.label.trim()}
                className="px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--palette-primary)' }}
              >
                {slotModal.index !== null ? 'Save Changes' : 'Add Slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

// ─── ScaffoldEditor ───────────────────────────────────────────────────────────

function ScaffoldEditor({ label, value, onChange, placeholder }: {
  label:       string
  value:       string
  onChange:    (v: string) => void
  placeholder: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={18}
        spellCheck={false}
        className="w-full text-xs font-mono rounded-md border bg-muted/20 px-3 py-2 text-foreground placeholder:text-muted-foreground resize-y"
      />
    </div>
  )
}
