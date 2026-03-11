'use client'

import { useRef, useState } from 'react'
import { useRouter }        from 'next/navigation'
import Link                 from 'next/link'
import { ChevronLeft, Upload, MessageSquare, Wrench, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn }                from '@/lib/utils'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewTemplatePage() {
  const router   = useRouter()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [path,         setPath]         = useState<'upload' | 'describe' | 'manual' | null>(null)
  const [file,         setFile]         = useState<File | null>(null)
  const [instructions, setInstructions] = useState('')
  const [description,  setDescription]  = useState('')
  const [tmplType,     setTmplType]     = useState<string>('narrative')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  async function handleUploadAnalyse() {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (instructions) fd.append('instructions', instructions)

      const res  = await fetch('/api/report-templates/analyse', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Analysis failed')

      // Pass proposal via sessionStorage then navigate to review
      sessionStorage.setItem('template_proposal', JSON.stringify(json.data.proposal))
      sessionStorage.setItem('template_proposal_filename', json.data.filename ?? file.name)
      router.push('/reports/templates/new/review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error analysing document')
      setLoading(false)
    }
  }

  async function handleDescribeGenerate() {
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    try {
      const apiKey = process.env.NEXT_PUBLIC_SUPABASE_URL // just to trigger the request
      void apiKey // suppress unused

      // Call analyse endpoint with description as text content
      const fd = new FormData()
      const blob = new Blob([description], { type: 'text/plain' })
      fd.append('file', blob, 'description.txt')
      fd.append('instructions', `The user wants to create a ${tmplType} template. They described it as: ${description}`)

      const res  = await fetch('/api/report-templates/analyse', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Generation failed')

      // Override template type with user selection
      const proposal = { ...json.data.proposal, template_type: tmplType }
      sessionStorage.setItem('template_proposal', JSON.stringify(proposal))
      sessionStorage.setItem('template_proposal_filename', 'description')
      router.push('/reports/templates/new/review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generating template')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/reports/templates" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Create Template</h1>
          <p className="text-sm text-muted-foreground">Choose how you want to create your report template</p>
        </div>
      </div>

      {/* Path selector */}
      {path === null && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PathCard
            icon={<Upload className="h-6 w-6" />}
            title="Upload Document"
            description="Upload an existing report or briefing doc and let the agent analyse it"
            onClick={() => setPath('upload')}
          />
          <PathCard
            icon={<MessageSquare className="h-6 w-6" />}
            title="Describe to Agent"
            description="Tell the agent what you want and it will build the template"
            onClick={() => setPath('describe')}
          />
          <PathCard
            icon={<Wrench className="h-6 w-6" />}
            title="Build Manually"
            description="Define slots, tokens and scaffold yourself"
            onClick={() => router.push('/reports/templates/new/manual')}
          />
        </div>
      )}

      {/* Upload Document path */}
      {path === 'upload' && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Upload Document</h2>
              <button onClick={() => { setPath(null); setFile(null); setError(null) }}
                className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
            </div>

            {/* File picker */}
            <div
              onClick={() => fileRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                file ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-muted-foreground'
              )}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              {file ? (
                <p className="text-sm text-foreground font-medium">{file.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Click to select a file<br />
                  <span className="text-xs">.html · .docx · .txt · .pdf (max 5 MB)</span>
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".html,.htm,.docx,.txt,.pdf"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Instructions */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Instructions (optional)</label>
              <textarea
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder="E.g. focus on the financial tables, extract all column headers as slots…"
                rows={3}
                className="w-full text-sm rounded-md border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              onClick={handleUploadAnalyse}
              disabled={!file || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--palette-primary)' }}
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing document…</> : 'Analyse Document →'}
            </button>
          </CardContent>
        </Card>
      )}

      {/* Describe to Agent path */}
      {path === 'describe' && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Describe to Agent</h2>
              <button onClick={() => { setPath(null); setError(null) }}
                className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Describe the report you want to create</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="E.g. A monthly P&L summary with company name, period, revenue, expenses and net profit, formatted with a dark header and company branding…"
                rows={5}
                className="w-full text-sm rounded-md border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Template type</label>
              <select
                value={tmplType}
                onChange={e => setTmplType(e.target.value)}
                className="w-full text-sm rounded-md border bg-background px-3 py-2 text-foreground"
              >
                <option value="financial">Financial</option>
                <option value="matrix">Matrix</option>
                <option value="narrative">Narrative</option>
                <option value="dashboard">Dashboard</option>
                <option value="workflow">Workflow</option>
              </select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              onClick={handleDescribeGenerate}
              disabled={!description.trim() || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--palette-primary)' }}
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating template…</> : 'Generate Template →'}
            </button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── PathCard ─────────────────────────────────────────────────────────────────

function PathCard({
  icon, title, description, onClick,
}: {
  icon:        React.ReactNode
  title:       string
  description: string
  onClick:     () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all p-6 space-y-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  )
}
