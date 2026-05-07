'use client'

import { useState, useEffect, useMemo } from 'react'
import type { Skill } from '@/lib/types'

interface SkillRow extends Skill {
  skill_knowledge_documents?: Array<{ file_name: string; document_id: string | null }>
}

const ALL_TOOL_OPTIONS = [
  'read_financials', 'read_companies', 'web_search',
  'list_documents', 'read_document', 'create_document', 'update_document',
  'list_report_templates', 'read_report_template', 'render_report', 'generate_report', 'analyse_document',
  'read_attachment', 'send_email', 'send_slack',
  'read_marketing_data', 'summarise_marketing',
]

function emptyDraft(): Partial<SkillRow> {
  return {
    name: '', slug: '', category: '', description: '', instructions: '',
    knowledge_text: '', examples: '', tool_grants: [],
    is_active: true, is_published: false, version: 1,
  }
}

export default function AdminSkillsPage() {
  const [skills,  setSkills]  = useState<SkillRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<'all' | 'published' | 'draft'>('all')
  const [search,  setSearch]  = useState('')
  const [editing, setEditing] = useState<Partial<SkillRow> | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [toast,   setToast]   = useState<string | null>(null)

  function loadAll() {
    setLoading(true)
    fetch('/api/admin/skills')
      .then(r => r.json())
      .then(json => setSkills((json.data ?? []) as SkillRow[]))
      .finally(() => setLoading(false))
  }
  useEffect(() => { loadAll() }, [])

  const filtered = useMemo(() => {
    let list = skills
    if (filter === 'published') list = list.filter(s => s.is_published)
    if (filter === 'draft')     list = list.filter(s => !s.is_published)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.category ?? '').toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      )
    }
    return list
  }, [skills, search, filter])

  async function saveSkill(opts: { publish?: boolean }) {
    if (!editing) return
    setSaving(true)
    try {
      const isUpdate = !!editing.id
      const url     = isUpdate ? `/api/admin/skills/${editing.id}` : '/api/admin/skills'
      const method  = isUpdate ? 'PATCH' : 'POST'
      const payload = {
        name:           editing.name,
        slug:           editing.slug,
        category:       editing.category,
        description:    editing.description,
        instructions:   editing.instructions,
        knowledge_text: editing.knowledge_text,
        examples:       editing.examples,
        tool_grants:    editing.tool_grants ?? [],
        is_active:      editing.is_active !== false,
        is_published:   opts.publish ?? !!editing.is_published,
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      setToast(opts.publish ? 'Published' : 'Saved')
      setEditing(null)
      loadAll()
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 3000)
    }
  }

  async function togglePublish(skill: SkillRow) {
    await fetch(`/api/admin/skills/${skill.id}/publish`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ publish: !skill.is_published }),
    })
    loadAll()
  }

  async function deleteSkill(skill: SkillRow) {
    if (!confirm(`Delete "${skill.name}"? This cannot be undone.`)) return
    await fetch(`/api/admin/skills/${skill.id}`, { method: 'DELETE' })
    loadAll()
  }

  async function exportSkill(skill: SkillRow) {
    const res = await fetch(`/api/admin/skills/${skill.id}/export`)
    const json = await res.json()
    if (!res.ok) { alert(json.error ?? 'Export failed'); return }
    const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `skill-${skill.slug}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function importSkill() {
    const input = document.createElement('input')
    input.type   = 'file'
    input.accept = 'application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        const payload = JSON.parse(text)
        const res     = await fetch('/api/admin/skills/import', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Import failed')
        setToast('Imported as draft')
        loadAll()
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Import failed')
      } finally {
        setTimeout(() => setToast(null), 3000)
      }
    }
    input.click()
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Platform Skills</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Skills available to every group. Published skills auto-apply to all agents
            unless individually disabled.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(emptyDraft())}
            className="text-xs px-3 py-1.5 rounded bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400"
          >
            + Create Skill
          </button>
          <button
            onClick={importSkill}
            className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          >
            Import JSON
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search skills…"
          className="text-xs h-8 px-3 rounded border border-zinc-700 bg-zinc-900 text-zinc-100 w-64"
        />
        {(['all','published','draft'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2.5 py-1 rounded border ${
              filter === f
                ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="text-xs text-zinc-500 ml-auto">
          {filtered.length} of {skills.length} skill{skills.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center">
          <p className="text-sm text-zinc-400">No skills yet.</p>
          <button
            onClick={() => setEditing(emptyDraft())}
            className="mt-3 text-xs px-3 py-1.5 rounded bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400"
          >
            + Create your first skill
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(s => (
            <div key={s.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-100 truncate">{s.name}</h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {s.category ?? 'Uncategorised'} · v{s.version}
                    {s.is_published
                      ? <span className="ml-1 text-emerald-400">· Published ✓</span>
                      : <span className="ml-1 text-zinc-500">· Draft</span>}
                  </p>
                </div>
              </div>
              <p className="text-xs text-zinc-300 line-clamp-2">{s.description}</p>
              <p className="text-[11px] text-zinc-500">
                {(s.tool_grants ?? []).length} tool grant{(s.tool_grants ?? []).length === 1 ? '' : 's'}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setEditing(s)}
                  className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                >Edit</button>
                <button
                  onClick={() => togglePublish(s)}
                  className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                >{s.is_published ? 'Unpublish' : 'Publish'}</button>
                <button
                  onClick={() => exportSkill(s)}
                  className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                >Export</button>
                <button
                  onClick={() => deleteSkill(s)}
                  className="text-[11px] px-2 py-1 rounded border border-red-900 text-red-400 hover:bg-red-950 ml-auto"
                >Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-200">
          {toast}
        </div>
      )}

      {/* Editor modal */}
      {editing && (
        <SkillEditor
          draft={editing}
          onChange={setEditing}
          saving={saving}
          onSaveDraft={() => saveSkill({ publish: false })}
          onSavePublish={() => saveSkill({ publish: true })}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

interface EditorProps {
  draft:        Partial<SkillRow>
  onChange:    (next: Partial<SkillRow>) => void
  saving:       boolean
  onSaveDraft:  () => void
  onSavePublish: () => void
  onCancel:     () => void
}

function SkillEditor({ draft, onChange, saving, onSaveDraft, onSavePublish, onCancel }: EditorProps) {
  const set = (patch: Partial<SkillRow>) => onChange({ ...draft, ...patch })

  function toggleTool(name: string) {
    const cur  = draft.tool_grants ?? []
    const next = cur.includes(name) ? cur.filter(t => t !== name) : [...cur, name]
    set({ tool_grants: next })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">
            {draft.id ? 'Edit Skill' : 'Create Skill'}
          </h2>
          <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-200">✕</button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name *">
              <input
                value={draft.name ?? ''}
                onChange={e => set({ name: e.target.value })}
                className="w-full h-9 px-3 rounded border border-zinc-700 bg-zinc-950 text-zinc-100"
                placeholder="Legal Document Review"
              />
            </Field>
            <Field label="Category">
              <input
                value={draft.category ?? ''}
                onChange={e => set({ category: e.target.value })}
                className="w-full h-9 px-3 rounded border border-zinc-700 bg-zinc-950 text-zinc-100"
                placeholder="Legal · Finance · Operations"
              />
            </Field>
          </div>

          <Field label="Description *">
            <textarea
              value={draft.description ?? ''}
              onChange={e => set({ description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded border border-zinc-700 bg-zinc-950 text-zinc-100"
              placeholder="One-line summary shown in the skill picker"
            />
          </Field>

          <Field label="Instructions * — injected into agent system prompt">
            <textarea
              value={draft.instructions ?? ''}
              onChange={e => set({ instructions: e.target.value })}
              rows={8}
              className="w-full px-3 py-2 rounded border border-zinc-700 bg-zinc-950 text-zinc-100 font-mono text-xs"
              placeholder={`When reviewing legal documents:\n- Identify all parties and their roles\n- Flag any unusual or potentially harmful clauses\n…`}
            />
          </Field>

          <Field label="Knowledge — background context for this skill">
            <textarea
              value={draft.knowledge_text ?? ''}
              onChange={e => set({ knowledge_text: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 rounded border border-zinc-700 bg-zinc-950 text-zinc-100"
              placeholder="Optional knowledge base text the agent always has available."
            />
          </Field>

          <Field label="Examples — few-shot examples of this skill in action">
            <textarea
              value={draft.examples ?? ''}
              onChange={e => set({ examples: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 rounded border border-zinc-700 bg-zinc-950 text-zinc-100"
              placeholder="Optional. Example interactions or output samples."
            />
          </Field>

          <Field label="Tool Grants — tools unlocked by this skill">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
              {ALL_TOOL_OPTIONS.map(t => {
                const on = (draft.tool_grants ?? []).includes(t)
                return (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleTool(t)}
                      className="rounded border-zinc-700"
                    />
                    <span className="font-mono">{t}</span>
                  </label>
                )
              })}
            </div>
          </Field>

          <Field label="Status">
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.is_active !== false}
                  onChange={e => set({ is_active: e.target.checked })}
                />
                Active
              </label>
              <span className="text-zinc-500">
                v{draft.version ?? 1} {draft.is_published ? '· Published' : '· Draft'}
              </span>
            </div>
          </Field>
        </div>

        <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 px-5 py-3 flex items-center justify-between gap-2">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            disabled={saving}
          >Cancel</button>
          <div className="flex items-center gap-2">
            <button
              onClick={onSaveDraft}
              className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
              disabled={saving}
            >Save Draft</button>
            <button
              onClick={onSavePublish}
              className="text-xs px-3 py-1.5 rounded bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400"
              disabled={saving}
            >{saving ? 'Saving…' : 'Save & Publish'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</label>
      {children}
    </div>
  )
}
