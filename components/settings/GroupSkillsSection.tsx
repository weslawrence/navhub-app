'use client'

import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Plus, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Skill } from '@/lib/types'

interface Assignment {
  id:         string
  sort_order: number
  skill_id:   string
  skills:     Skill | null
}

interface SkillsResponse {
  data?: {
    assigned:           Assignment[]
    own:                Skill[]
    available_platform: Skill[]
  }
  error?: string
}

const ALL_TOOL_OPTIONS = [
  'read_financials','read_companies','web_search',
  'list_documents','read_document','create_document','update_document',
  'list_report_templates','read_report_template','render_report','generate_report','analyse_document',
  'read_attachment','send_email','send_slack',
  'read_marketing_data','summarise_marketing',
]

interface Draft {
  name:           string
  description:    string
  instructions:   string
  knowledge_text: string
  examples:       string
  category:       string
  tool_grants:    string[]
  // For editing an existing group skill via a group_skills row
  assignment_id?: string
}

const emptyDraft = (): Draft => ({
  name: '', description: '', instructions: '',
  knowledge_text: '', examples: '', category: '',
  tool_grants: [],
})

export default function GroupSkillsSection({ isAdmin }: { isAdmin: boolean }) {
  const [data,    setData]    = useState<SkillsResponse['data'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [busy,    setBusy]    = useState(false)
  const [toast,   setToast]   = useState<string | null>(null)

  function loadAll() {
    setLoading(true)
    fetch('/api/settings/skills')
      .then(r => r.json())
      .then((j: SkillsResponse) => setData(j.data ?? null))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (isAdmin) loadAll() }, [isAdmin])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const assigned = data?.assigned ?? []
  const availablePlatform = data?.available_platform ?? []

  const assignedById = useMemo(() => {
    const m: Record<string, Assignment> = {}
    for (const a of assigned) m[a.skill_id] = a
    return m
  }, [assigned])

  async function assignPlatform(skillId: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/settings/skills', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'assign', skill_id: skillId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Assign failed')
      }
      setToast('Skill added')
      setPicking(false)
      loadAll()
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Assign failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveGroupSkill(d: Draft) {
    setBusy(true)
    try {
      const isUpdate = !!d.assignment_id
      const url     = isUpdate ? `/api/settings/skills/${d.assignment_id}` : '/api/settings/skills'
      const method  = isUpdate ? 'PATCH' : 'POST'
      const body    = isUpdate
        ? { skill: { name: d.name, description: d.description, instructions: d.instructions, knowledge_text: d.knowledge_text, examples: d.examples, category: d.category, tool_grants: d.tool_grants } }
        : { action: 'create_group', name: d.name, description: d.description, instructions: d.instructions, knowledge_text: d.knowledge_text, examples: d.examples, category: d.category, tool_grants: d.tool_grants }
      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Save failed')
      }
      setToast(isUpdate ? 'Saved' : 'Skill created')
      setEditing(null)
      loadAll()
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function removeAssignment(a: Assignment, purge: boolean) {
    if (!confirm(purge ? `Delete skill "${a.skills?.name}"? This cannot be undone.` : `Remove "${a.skills?.name}" from this group?`)) return
    const qs = purge ? '?purge_skill=true' : ''
    await fetch(`/api/settings/skills/${a.id}${qs}`, { method: 'DELETE' })
    loadAll()
  }

  function startEditAssignment(a: Assignment) {
    if (!a.skills || a.skills.tier !== 'group') return
    setEditing({
      assignment_id:  a.id,
      name:           a.skills.name,
      description:    a.skills.description,
      instructions:   a.skills.instructions,
      knowledge_text: a.skills.knowledge_text ?? '',
      examples:       a.skills.examples ?? '',
      category:       a.skills.category ?? '',
      tool_grants:    a.skills.tool_grants ?? [],
    })
  }

  if (!isAdmin) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Group Skills
        </CardTitle>
        <CardDescription>
          Skills automatically applied to every agent in this group. Add platform skills
          or create group-specific ones.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setPicking(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Platform Skill
          </Button>
          <Button size="sm" onClick={() => setEditing(emptyDraft())}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Create Group Skill
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : assigned.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No skills assigned yet. Add a platform skill or create a group-specific one above.
          </p>
        ) : (
          <ul className="divide-y border rounded-md">
            {assigned.map(a => {
              const tier = a.skills?.tier ?? 'platform'
              const tierLabel = tier === 'platform' ? 'Platform' : 'Group'
              return (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                      {a.skills?.name ?? '(missing)'}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tier === 'platform' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'}`}>
                        {tierLabel}
                      </span>
                    </p>
                    {a.skills?.description && (
                      <p className="text-xs text-muted-foreground truncate">{a.skills.description}</p>
                    )}
                  </div>
                  {tier === 'group' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={() => startEditAssignment(a)}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
                    onClick={() => removeAssignment(a, tier === 'group')}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Remove
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        {toast && (
          <p className="text-xs text-muted-foreground">{toast}</p>
        )}
      </CardContent>

      {/* Platform skill picker */}
      {picking && (
        <SkillPicker
          options={availablePlatform}
          assignedIds={Object.keys(assignedById)}
          busy={busy}
          onPick={assignPlatform}
          onClose={() => setPicking(false)}
        />
      )}

      {/* Editor */}
      {editing && (
        <SkillDraftEditor
          draft={editing}
          onChange={setEditing}
          busy={busy}
          onSave={() => saveGroupSkill(editing)}
          onCancel={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function SkillPicker({
  options, assignedIds, busy, onPick, onClose,
}: {
  options:     Skill[]
  assignedIds: string[]
  busy:        boolean
  onPick:      (id: string) => void
  onClose:     () => void
}) {
  const [search, setSearch] = useState('')
  const list = options.filter(s => {
    if (assignedIds.includes(s.id)) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background border rounded-lg w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Add Platform Skill</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search skills…"
            className="w-full h-9 px-3 rounded border border-input bg-background text-sm"
          />
          {list.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No platform skills available.</p>
          ) : (
            <ul className="divide-y border rounded">
              {list.map(s => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.description}</p>
                  </div>
                  <Button size="sm" disabled={busy} onClick={() => onPick(s.id)}>
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function SkillDraftEditor({
  draft, onChange, busy, onSave, onCancel,
}: {
  draft:    Draft
  onChange: (d: Draft) => void
  busy:     boolean
  onSave:   () => void
  onCancel: () => void
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  const toggleTool = (t: string) => {
    set({ tool_grants: draft.tool_grants.includes(t)
      ? draft.tool_grants.filter(x => x !== t)
      : [...draft.tool_grants, t] })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-background border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{draft.assignment_id ? 'Edit Group Skill' : 'Create Group Skill'}</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <Field label="Name *">
            <input value={draft.name} onChange={e => set({ name: e.target.value })} className="w-full h-9 px-3 rounded border border-input bg-background" />
          </Field>
          <Field label="Description *">
            <textarea value={draft.description} onChange={e => set({ description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded border border-input bg-background" />
          </Field>
          <Field label="Instructions *">
            <textarea value={draft.instructions} onChange={e => set({ instructions: e.target.value })} rows={6} className="w-full px-3 py-2 rounded border border-input bg-background font-mono text-xs" />
          </Field>
          <Field label="Knowledge (optional)">
            <textarea value={draft.knowledge_text} onChange={e => set({ knowledge_text: e.target.value })} rows={3} className="w-full px-3 py-2 rounded border border-input bg-background" />
          </Field>
          <Field label="Examples (optional)">
            <textarea value={draft.examples} onChange={e => set({ examples: e.target.value })} rows={3} className="w-full px-3 py-2 rounded border border-input bg-background" />
          </Field>
          <Field label="Tool Grants">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
              {ALL_TOOL_OPTIONS.map(t => (
                <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={draft.tool_grants.includes(t)} onChange={() => toggleTool(t)} className="rounded border-input" />
                  <span className="font-mono">{t}</span>
                </label>
              ))}
            </div>
          </Field>
        </div>
        <div className="sticky bottom-0 bg-background border-t px-4 py-3 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button size="sm" onClick={onSave} disabled={busy || !draft.name || !draft.description || !draft.instructions}>
            {busy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Save
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
