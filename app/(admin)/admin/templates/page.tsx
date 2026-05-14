'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AgentTemplate } from '@/lib/types'

const CATEGORIES = ['legal','financial','marketing','operations','hr','general','technical','compliance'] as const

export default function AdminTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filterCat, setFilterCat] = useState<string>('all')
  const [filterPub, setFilterPub] = useState<'all' | 'published' | 'draft'>('all')
  const [search,    setSearch]    = useState('')
  const [creating,  setCreating]  = useState(false)

  function load() {
    setLoading(true)
    fetch('/api/admin/templates')
      .then(r => r.json())
      .then((j: { data?: AgentTemplate[] }) => setTemplates(j.data ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function createBlank() {
    setCreating(true)
    try {
      const res = await fetch('/api/admin/templates', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:                 'Untitled Template',
          category:             'general',
          description:          'Describe what this agent does for users…',
          summary_capabilities: 'This agent can: (list capabilities)',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Create failed')
      router.push(`/admin/templates/${json.data.id}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const filtered = templates.filter(t => {
    if (filterCat !== 'all' && t.category !== filterCat) return false
    if (filterPub === 'published' && !t.is_published) return false
    if (filterPub === 'draft'     &&  t.is_published) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
    }
    return true
  })
  const featured = templates.filter(t => t.is_featured && t.is_published)

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Agent Templates</h1>
          <p className="text-xs text-zinc-400 mt-0.5 max-w-2xl">
            Pre-built agent configurations users clone when creating their own agents.
            Persona / instructions / template skills + knowledge are hidden from end users.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/builder"
            className="text-xs px-3 py-1.5 rounded border border-violet-700 text-violet-300 hover:bg-violet-950/30"
          >
            ✨ Builder Assistant
          </Link>
          <button
            onClick={createBlank}
            disabled={creating}
            className="text-xs px-3 py-1.5 rounded bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 disabled:opacity-60"
          >
            {creating ? 'Creating…' : '+ Create Template'}
          </button>
        </div>
      </div>

      {featured.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-zinc-500">Featured</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {featured.map(t => (
              <TemplateCard key={t.id} template={t} compact />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="text-xs h-8 px-3 rounded border border-zinc-700 bg-zinc-900 text-zinc-100 w-64"
          />
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            className="text-xs h-8 px-2 rounded border border-zinc-700 bg-zinc-900 text-zinc-100"
          >
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterPub}
            onChange={e => setFilterPub(e.target.value as typeof filterPub)}
            className="text-xs h-8 px-2 rounded border border-zinc-700 bg-zinc-900 text-zinc-100"
          >
            <option value="all">All</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          <span className="ml-auto text-xs text-zinc-500">
            {filtered.length} of {templates.length}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-zinc-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">No templates match.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(t => <TemplateCard key={t.id} template={t} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function TemplateCard({ template, compact }: { template: AgentTemplate; compact?: boolean }) {
  return (
    <Link
      href={`/admin/templates/${template.id}`}
      className="block rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 hover:border-zinc-700 hover:bg-zinc-900/60 transition-colors"
    >
      <div className="flex items-start gap-2">
        <span className="text-2xl leading-none">{template.avatar_preset ?? '🤖'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-zinc-100 truncate">{template.name}</h3>
            {template.is_featured && (
              <span className="text-[10px] uppercase tracking-wider text-amber-400">Featured</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">{template.category}</span>
            <span className="text-[10px] text-zinc-500">v{template.version}</span>
            <span className={`text-[10px] uppercase tracking-wider ${template.is_published ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {template.is_published ? '● Published' : '○ Draft'}
            </span>
          </div>
          {!compact && (
            <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{template.description}</p>
          )}
          <p className="text-[11px] text-zinc-500 mt-2">{template.use_count} uses</p>
        </div>
      </div>
    </Link>
  )
}
