'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import AgentForm from '../_form'

interface TemplateSummary {
  id:                   string
  name:                 string
  slug:                 string
  category:             string
  description:          string
  summary_capabilities: string
  avatar_preset:        string | null
  color:                string | null
  is_featured:          boolean
}

export default function NewAgentPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  // ?from=blank → skip the gallery and show the scratch form directly.
  const startBlank = searchParams.get('from') === 'blank'

  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null)
  const [search,    setSearch]    = useState('')
  const [filterCat, setFilterCat] = useState<string>('all')
  const [creating,  setCreating]  = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    if (startBlank) return
    fetch('/api/agent-templates')
      .then(r => r.json())
      .then((j: { data?: TemplateSummary[] }) => setTemplates(j.data ?? []))
      .catch(() => setTemplates([]))
  }, [startBlank])

  if (startBlank) {
    return <AgentForm mode="create" />
  }

  if (templates === null) {
    return (
      <div className="flex items-center justify-center min-h-48 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading templates…
      </div>
    )
  }

  async function applyTemplate(t: TemplateSummary) {
    setCreating(t.id)
    setError(null)
    try {
      const res = await fetch('/api/agents', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:          t.name,
          description:   t.description,
          avatar_color:  t.color ?? '#6366f1',
          template_id:   t.id,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Create failed')
      router.push(`/agents/${j.data.id}/edit?fromTemplate=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setCreating(null)
    }
  }

  const categories = Array.from(new Set(templates.map(t => t.category))).sort()
  const filtered   = templates.filter(t => {
    if (filterCat !== 'all' && t.category !== filterCat) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
    }
    return true
  })
  const featured = filtered.filter(t => t.is_featured)

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Create a new agent</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Start from a pre-built template or build from scratch. Templates come with built-in
            expertise tailored to specific kinds of work.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/agents/new?from=blank')}
        >
          Start from scratch →
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {featured.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Featured templates
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {featured.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                busy={creating === t.id}
                onUse={() => applyTemplate(t)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">All templates</h2>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="h-8 text-xs px-3 rounded border border-input bg-background w-64 ml-2"
          />
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            className="h-8 text-xs px-2 rounded border border-input bg-background"
          >
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} template{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No templates match. <button onClick={() => router.push('/agents/new?from=blank')} className="text-primary hover:underline">Start from scratch</button> instead?
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(t => (
              <TemplateCard
                key={t.id}
                template={t}
                busy={creating === t.id}
                onUse={() => applyTemplate(t)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function TemplateCard({ template, busy, onUse }: {
  template: TemplateSummary
  busy:     boolean
  onUse:    () => void
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="pt-4 flex-1 space-y-3">
        <div className="flex items-start gap-2">
          <span className="text-2xl leading-none">{template.avatar_preset ?? '🤖'}</span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{template.category}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-3">{template.description}</p>
        {template.summary_capabilities && (
          <p className="text-[11px] text-muted-foreground border-t pt-2 line-clamp-3">
            {template.summary_capabilities}
          </p>
        )}
        <Button
          size="sm"
          className="w-full mt-1"
          onClick={onUse}
          disabled={busy}
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          {busy ? 'Creating…' : 'Use template'}
        </Button>
      </CardContent>
    </Card>
  )
}
