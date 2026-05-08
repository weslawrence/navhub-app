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

  // Group-tier skills assigned to this group — these are the ones the admin
  // created. Platform skills are managed by NavHub super admins and apply
  // automatically; we list them read-only at the bottom for transparency.
  const groupAssignments = useMemo(() => {
    return (data?.assigned ?? []).filter(a => a.skills?.tier === 'group')
  }, [data])

  // Platform skills auto-apply to every group when published — they don't
  // need to be assigned via group_skills. The admin API still returns the
  // full list under available_platform so the user can see what's active.
  const autoAppliedPlatform = data?.available_platform ?? []

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

  async function deleteGroupSkill(a: Assignment) {
    if (!confirm(`Delete skill "${a.skills?.name}"? This cannot be undone.`)) return
    await fetch(`/api/settings/skills/${a.id}?purge_skill=true`, { method: 'DELETE' })
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
          Create skills specific to this group. Platform skills are managed by NavHub
          administrators and applied automatically to every agent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Button size="sm" onClick={() => setEditing(emptyDraft())}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Create Group Skill
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : groupAssignments.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No group-specific skills yet. Click <strong>Create Group Skill</strong> to add one.
          </p>
        ) : (
          <ul className="divide-y border rounded-md">
            {groupAssignments.map(a => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                    {a.skills?.name ?? '(missing)'}
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                      Group
                    </span>
                  </p>
                  {a.skills?.description && (
                    <p className="text-xs text-muted-foreground truncate">{a.skills.description}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2"
                  onClick={() => startEditAssignment(a)}
                >
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteGroupSkill(a)}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Platform skills — read-only, transparency for the admin. */}
        {autoAppliedPlatform.length > 0 && (
          <div className="mt-4 pt-4 border-t space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Platform Skills (auto-applied)
            </p>
            <p className="text-[11px] text-muted-foreground">
              These platform-level skills apply to every agent in your group. They are managed
              by NavHub administrators — contact support if you need changes.
            </p>
            <ul className="space-y-1">
              {autoAppliedPlatform.map(skill => (
                <li
                  key={skill.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1.5 rounded bg-muted/30"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="font-medium text-foreground">{skill.name}</span>
                  {skill.category && (
                    <span className="ml-auto text-[10px] uppercase tracking-wide">
                      {skill.category}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {toast && <p className="text-xs text-muted-foreground">{toast}</p>}
      </CardContent>

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
