'use client'

import { useEffect, useState } from 'react'
import type { PlatformKnowledge } from '@/lib/types'

export default function AdminKnowledgePage() {
  const [items,    setItems]    = useState<PlatformKnowledge[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [activeOnly, setActiveOnly] = useState(false)
  const [editing,  setEditing]  = useState<PlatformKnowledge | null>(null)
  const [creating, setCreating] = useState(false)
  const [toast,    setToast]    = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch('/api/admin/knowledge')
      .then(r => r.json())
      .then((j: { data?: PlatformKnowledge[] }) => setItems(j.data ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  async function save(patch: Partial<PlatformKnowledge>, id?: string) {
    const isNew = !id
    const res = await fetch(isNew ? '/api/admin/knowledge' : `/api/admin/knowledge/${id}`, {
      method:  isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(patch),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setToast(j.error ?? 'Save failed')
      return false
    }
    setToast(isNew ? 'Created' : 'Saved')
    setEditing(null)
    setCreating(false)
    load()
    return true
  }

  async function remove(id: string) {
    if (!confirm('Delete this knowledge entry? Templates that reference it will lose this content.')) return
    const res = await fetch(`/api/admin/knowledge/${id}`, { method: 'DELETE' })
    if (res.ok) { setToast('Deleted'); load() }
  }

  const categories = Array.from(new Set(items.map(i => i.category).filter((c): c is string => !!c))).sort()
  const filtered = items.filter(i => {
    if (activeOnly && !i.is_active) return false
    if (filterCat !== 'all' && i.category !== filterCat) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!i.title.toLowerCase().includes(q) && !i.content.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Platform Knowledge</h1>
          <p className="text-xs text-zinc-400 mt-0.5 max-w-2xl">
            Shared content that agent templates and groups can opt into. Inlined into the
            system prompt at run time. Hidden from end users.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="text-xs px-3 py-1.5 rounded bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400"
        >+ Add Knowledge</button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search title or content…"
          className="text-xs h-8 px-3 rounded border border-zinc-700 bg-zinc-900 text-zinc-100 w-72"
        />
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="text-xs h-8 px-2 rounded border border-zinc-700 bg-zinc-900 text-zinc-100"
        >
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="text-xs text-zinc-300 inline-flex items-center gap-1.5">
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
          Active only
        </label>
        <span className="ml-auto text-xs text-zinc-500">{filtered.length} of {items.length}</span>
      </div>

      {(creating || editing) && (
        <KnowledgeEditor
          initial={editing ?? undefined}
          onSave={patch => save(patch, editing?.id)}
          onCancel={() => { setEditing(null); setCreating(false) }}
        />
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">No knowledge entries.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id} className="rounded border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-medium text-zinc-100">{item.title}</h3>
                {item.category && (
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">{item.category}</span>
                )}
                <span className={`text-[10px] ${item.is_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
                  {item.is_active ? '● Active' : '○ Inactive'}
                </span>
                <span className="text-[10px] text-zinc-500 ml-auto">{item.content.length.toLocaleString()} chars</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{item.content}</p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setEditing(item)}
                  className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                >Edit</button>
                <button
                  onClick={() => remove(item.id)}
                  className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-red-400 hover:bg-zinc-800"
                >Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-200">
          {toast}
        </div>
      )}
    </div>
  )
}

function KnowledgeEditor({
  initial, onSave, onCancel,
}: {
  initial?:  PlatformKnowledge
  onSave:    (patch: Partial<PlatformKnowledge>) => Promise<boolean>
  onCancel:  () => void
}) {
  const [title,    setTitle]    = useState(initial?.title    ?? '')
  const [slug,     setSlug]     = useState(initial?.slug     ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [source,   setSource]   = useState(initial?.source_url ?? '')
  const [content,  setContent]  = useState(initial?.content  ?? '')
  const [active,   setActive]   = useState(initial?.is_active ?? true)
  const [busy,     setBusy]     = useState(false)

  async function submit() {
    setBusy(true)
    await onSave({
      title, slug, content,
      category:   category || null,
      source_url: source   || null,
      is_active:  active,
    })
    setBusy(false)
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-zinc-100">
        {initial ? `Edit: ${initial.title}` : 'New knowledge entry'}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={title}    onChange={e => setTitle(e.target.value)}    placeholder="Title"    className="text-sm px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-100" />
        <input value={slug}     onChange={e => setSlug(e.target.value)}     placeholder="slug (auto if blank)" className="text-sm px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-100 font-mono" />
        <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Category (optional)" className="text-sm px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-100" />
        <input value={source}   onChange={e => setSource(e.target.value)}   placeholder="Source URL (optional)" className="text-sm px-3 py-1.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-100" />
      </div>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Content (markdown supported)…"
        rows={12}
        className="w-full text-sm font-mono px-3 py-2 rounded border border-zinc-700 bg-zinc-900 text-zinc-100"
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-zinc-300 inline-flex items-center gap-1.5">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          Active
        </label>
        <span className="ml-auto" />
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800">Cancel</button>
        <button
          onClick={submit}
          disabled={busy || !title.trim() || !content.trim()}
          className="text-xs px-3 py-1.5 rounded bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 disabled:opacity-60"
        >{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  )
}
