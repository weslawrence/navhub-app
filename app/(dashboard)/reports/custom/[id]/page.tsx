'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter }                       from 'next/navigation'
import Link                                           from 'next/link'
import {
  ArrowLeft, Download, Trash2, Loader2, AlertCircle,
  ExternalLink, Share2, Copy, Check, X, Link2, Link2Off, Pencil,
  Tag, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge }  from '@/components/ui/badge'
import { cn }     from '@/lib/utils'

// ── Share status type ─────────────────────────────────────────────────────────
interface ShareStatus {
  is_shareable: boolean
  share_url:    string | null
  created_at:   string | null
}

// ── Share Popover ─────────────────────────────────────────────────────────────
function SharePopover({
  reportId,
  onClose,
}: {
  reportId: string
  onClose:  () => void
}) {
  const [status,  setStatus]  = useState<ShareStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [copied,  setCopied]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/reports/custom/${reportId}/share`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load share status')
      setStatus(json.data as ShareStatus)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [reportId])

  useEffect(() => { void load() }, [load])

  async function handleGenerate() {
    setSaving(true)
    setError(null)
    try {
      const res  = await fetch(`/api/reports/custom/${reportId}/share`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to generate link')
      setStatus(json.data as ShareStatus)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRevoke() {
    if (!confirm('Revoke the share link? Anyone with the current link will immediately lose access.')) return
    setSaving(true)
    setError(null)
    try {
      const res  = await fetch(`/api/reports/custom/${reportId}/share`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to revoke')
      setStatus(json.data as ShareStatus)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    if (!status?.share_url) return
    try {
      await navigator.clipboard.writeText(status.share_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      <div
        className="mt-14 mr-4 w-80 rounded-lg border bg-card shadow-lg p-4 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Share2 className="h-4 w-4 text-muted-foreground" />
            Share Report
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && !loading && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {!loading && status && (
          <>
            {!status.is_shareable ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Link2Off className="h-4 w-4 shrink-0" />
                  <p className="text-sm">This report is private.</p>
                </div>
                <Button className="w-full" size="sm" onClick={() => void handleGenerate()} disabled={saving}>
                  {saving
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating…</>
                    : <><Link2 className="h-3.5 w-3.5 mr-1.5" /> Generate share link</>}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Share link</label>
                  <div className="flex gap-1.5">
                    <input
                      readOnly
                      value={status.share_url ?? ''}
                      className="flex-1 text-xs px-2 py-1.5 rounded border bg-muted font-mono truncate"
                      onFocus={e => e.target.select()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="px-2 shrink-0"
                      onClick={() => void handleCopy()}
                    >
                      {copied
                        ? <Check className="h-3.5 w-3.5 text-green-500" />
                        : <Copy  className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                {status.created_at && (
                  <p className="text-xs text-muted-foreground">
                    Link generated {new Date(status.created_at).toLocaleDateString()}
                  </p>
                )}
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded px-2.5 py-2">
                  Anyone with this link can view this report without logging in.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive border-destructive/30 hover:border-destructive"
                  onClick={() => void handleRevoke()}
                  disabled={saving}
                >
                  {saving
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Revoking…</>
                    : <><Link2Off className="h-3.5 w-3.5 mr-1.5" /> Revoke link</>}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Tag Editor ────────────────────────────────────────────────────────────────
function TagEditor({
  tags,
  allTags,
  saving,
  onAdd,
  onRemove,
  onSave,
  onCancel,
}: {
  tags:     string[]
  allTags:  string[]
  saving:   boolean
  onAdd:    (tag: string) => void
  onRemove: (tag: string) => void
  onSave:   () => void
  onCancel: () => void
}) {
  const [input, setInput]       = useState('')
  const [focused, setFocused]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = allTags.filter(t =>
    !tags.includes(t) && (input === '' || t.toLowerCase().includes(input.toLowerCase()))
  ).slice(0, 8)

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && input.trim()) {
      const tag = input.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
      if (tag && !tags.includes(tag)) onAdd(tag)
      setInput('')
      e.preventDefault()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="flex items-start gap-3 flex-wrap">
      {/* Current tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {tags.map(tag => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-xs gap-1 pr-1 cursor-default"
          >
            {tag}
            <button
              onClick={() => onRemove(tag)}
              className="hover:text-destructive transition-colors ml-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}

        {/* Input + suggestions */}
        <div className="relative">
          <div className="flex items-center gap-1 border rounded-md px-2 py-0.5 bg-background focus-within:ring-1 focus-within:ring-ring">
            <Plus className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder="Add tag…"
              className="text-xs outline-none bg-transparent w-24"
            />
          </div>

          {/* Autocomplete dropdown */}
          {focused && suggestions.length > 0 && (
            <div className="absolute left-0 top-full mt-1 z-20 w-40 rounded-md border bg-popover shadow-md py-1">
              {suggestions.map(s => (
                <button
                  key={s}
                  onMouseDown={() => { onAdd(s); setInput(''); inputRef.current?.focus() }}
                  className="w-full text-left px-3 py-1 text-xs hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 ml-auto">
        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" className="h-6 text-xs px-2" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save tags'}
        </Button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ReportViewerPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [reportName, setReportName] = useState<string>('')
  const [groupName,  setGroupName]  = useState<string>('')
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [deleting,   setDeleting]   = useState(false)
  const [ready,      setReady]      = useState(false)
  const [showShare,  setShowShare]  = useState(false)
  const [saveToast,  setSaveToast]  = useState<string | null>(null)

  // Edit mode state
  const [editMode,   setEditMode]   = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Tag state
  const [tags,        setTags]        = useState<string[]>([])
  const [allTags,     setAllTags]     = useState<string[]>([])
  const [editingTags, setEditingTags] = useState(false)
  const [draftTags,   setDraftTags]   = useState<string[]>([])
  const [tagSaving,   setTagSaving]   = useState(false)

  const fileUrl = `/api/reports/custom/${params.id}/file`

  // Auto-dismiss save toast
  useEffect(() => {
    if (!saveToast) return
    const t = setTimeout(() => setSaveToast(null), 3000)
    return () => clearTimeout(t)
  }, [saveToast])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [metaRes, groupRes, tagsRes] = await Promise.all([
          fetch(`/api/reports/custom/${params.id}`),
          fetch('/api/groups/active'),
          fetch('/api/reports/custom/tags'),
        ])
        const metaJson  = await metaRes.json()
        const groupJson = await groupRes.json()
        const tagsJson  = await tagsRes.json()

        if (!metaRes.ok) {
          throw new Error(metaJson.error ?? 'Report not found')
        }

        setReportName(metaJson.data.name)
        setTags(metaJson.data.tags ?? [])
        if (groupJson.data) {
          setIsAdmin(groupJson.data.is_admin)
          setGroupName(groupJson.data.group?.name ?? '')
        }
        if (tagsJson.data) setAllTags(tagsJson.data as string[])
        setReady(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [params.id])

  async function handleDelete() {
    if (!confirm(`Delete "${reportName}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res  = await fetch(`/api/reports/custom/${params.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to delete')
      router.push('/reports/custom')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  // ── Tag handlers ───────────────────────────────────────────────────────────

  function openTagEditor() {
    setDraftTags([...tags])
    setEditingTags(true)
  }

  function cancelTagEdit() {
    setDraftTags([])
    setEditingTags(false)
  }

  async function saveTags() {
    setTagSaving(true)
    try {
      const res  = await fetch(`/api/reports/custom/${params.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tags: draftTags }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save tags')
      setTags(json.data.tags ?? draftTags)
      // Update allTags with any new ones
      setAllTags(prev => {
        const merged = [...prev, ...draftTags]
        return merged.filter((v, i, a) => a.indexOf(v) === i).sort()
      })
      setEditingTags(false)
      setDraftTags([])
      setSaveToast('Tags saved')
    } catch (err) {
      setSaveToast(err instanceof Error ? err.message : 'Failed to save tags')
    } finally {
      setTagSaving(false)
    }
  }

  // ── Edit mode helpers ──────────────────────────────────────────────────────

  function enterEditMode() {
    setEditMode(true)
    setTimeout(() => {
      const iframe = iframeRef.current
      if (!iframe?.contentDocument) return
      const doc = iframe.contentDocument

      const editableSelectors = [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'span', 'td', 'th', 'li',
        'div:not(:has(> div)):not(:has(> table))',
      ]

      editableSelectors.forEach(selector => {
        doc.querySelectorAll(selector).forEach((el: Element) => {
          const hasBlockChildren = Array.from(el.children).some(child =>
            ['DIV', 'P', 'TABLE', 'UL', 'OL', 'H1', 'H2', 'H3'].includes(child.tagName)
          )
          if (!hasBlockChildren) {
            ;(el as HTMLElement).contentEditable = 'true'
            ;(el as HTMLElement).style.outline   = 'none'
            ;(el as HTMLElement).style.cursor    = 'text'
          }
        })
      })

      const style = doc.createElement('style')
      style.id = 'navhub-edit-styles'
      style.textContent = `
        [contenteditable="true"] {
          border-radius: 2px;
          transition: background 0.15s;
        }
        [contenteditable="true"]:hover {
          background: rgba(251,191,36,0.08) !important;
          outline: 1px dashed rgba(251,191,36,0.4) !important;
          outline-offset: 2px;
        }
        [contenteditable="true"]:focus {
          background: rgba(251,191,36,0.12) !important;
          outline: 1.5px solid rgba(251,191,36,0.6) !important;
          outline-offset: 2px;
        }
      `
      doc.head.appendChild(style)
    }, 100)
  }

  function exitEditMode() {
    setEditMode(false)
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return
    const doc = iframe.contentDocument
    doc.querySelectorAll('[contenteditable]').forEach((el: Element) => {
      ;(el as HTMLElement).removeAttribute('contenteditable')
      ;(el as HTMLElement).style.cursor = ''
    })
    doc.getElementById('navhub-edit-styles')?.remove()
  }

  async function saveReport() {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return

    setEditSaving(true)
    try {
      const doc = iframe.contentDocument

      // Strip edit mode artifacts before serialising
      doc.querySelectorAll('[contenteditable]').forEach((el: Element) => {
        ;(el as HTMLElement).removeAttribute('contenteditable')
        ;(el as HTMLElement).style.cursor  = ''
        ;(el as HTMLElement).style.outline = ''
      })
      doc.getElementById('navhub-edit-styles')?.remove()

      const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML

      const res = await fetch(`/api/reports/custom/${params.id}/content`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ html }),
      })

      if (!res.ok) throw new Error('Failed to save')

      // Exit edit mode cleanly and show success toast
      exitEditMode()
      setSaveToast('Report saved')
    } catch (err) {
      console.error('Save failed:', err)
      setSaveToast(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)]" style={{ minHeight: 0 }}>
      {/* Share popover */}
      {showShare && (
        <SharePopover
          reportId={params.id}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Save / error toast */}
      {saveToast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 flex items-center gap-2 rounded-md px-4 py-2.5 text-sm shadow-lg',
          saveToast.toLowerCase().includes('saved') || saveToast.toLowerCase().includes('tags saved')
            ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            : 'bg-destructive/10 text-destructive border border-destructive/20'
        )}>
          {(saveToast.toLowerCase().includes('saved'))
            ? <Check className="h-4 w-4 shrink-0" />
            : <AlertCircle className="h-4 w-4 shrink-0" />}
          {saveToast}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 pb-2 flex-shrink-0">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reports/custom">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Reports Library
          </Link>
        </Button>

        {reportName && (
          <span className="text-sm font-medium text-muted-foreground truncate flex-1">
            {reportName}
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          {ready && (
            <>
              <Button variant="outline" size="sm" asChild>
                <a href={fileUrl} download={reportName || 'report.html'} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4 mr-1.5" /> Download
                </a>
              </Button>

              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowShare(s => !s)}
                  className={cn(showShare && 'border-primary text-primary')}
                >
                  <Share2 className="h-4 w-4 mr-1.5" /> Share
                </Button>
              )}

              <Button variant="outline" size="sm" asChild>
                <a href={`/view/report/${params.id}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1.5" /> Open in tab
                </a>
              </Button>

              {isAdmin && !editMode && (
                <Button variant="outline" size="sm" onClick={enterEditMode}>
                  <Pencil className="h-4 w-4 mr-1.5" /> Edit Report
                </Button>
              )}

              {isAdmin && editMode && (
                <>
                  <Button variant="outline" size="sm" onClick={exitEditMode}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void saveReport()} disabled={editSaving}>
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </>
              )}
            </>
          )}

          {isAdmin && !editMode && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2  className="h-4 w-4 mr-1.5" />}
              {!deleting && 'Delete'}
            </Button>
          )}
        </div>
      </div>

      {/* Tags row — shown when report is ready */}
      {ready && !loading && !error && (
        <div className="flex items-center gap-2 pb-2 flex-shrink-0 min-h-[28px]">
          <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

          {editingTags ? (
            <TagEditor
              tags={draftTags}
              allTags={allTags}
              saving={tagSaving}
              onAdd={t => setDraftTags(prev => prev.includes(t) ? prev : [...prev, t])}
              onRemove={t => setDraftTags(prev => prev.filter(x => x !== t))}
              onSave={() => void saveTags()}
              onCancel={cancelTagEdit}
            />
          ) : (
            <>
              {tags.length > 0 ? (
                <div className="flex items-center gap-1 flex-wrap">
                  {tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/60">No tags</span>
              )}
              {isAdmin && (
                <button
                  onClick={openTagEditor}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1 underline-offset-2 hover:underline"
                >
                  Edit tags
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Content area */}
      <div className={cn(
        'flex-1 rounded-lg border overflow-hidden flex flex-col',
        (loading || error) && 'bg-white dark:bg-gray-950 items-center justify-center'
      )}>
        {loading && (
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Loading report…</p>
          </div>
        )}

        {error && !loading && (
          <div className="text-center space-y-3 max-w-sm px-4">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm font-medium">{error}</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/reports/custom">Back to library</Link>
            </Button>
          </div>
        )}

        {ready && !loading && !error && (
          <>
            {/* Branded header */}
            <div
              className="flex items-center gap-3 px-4 flex-shrink-0"
              style={{
                height:       '44px',
                background:   'var(--palette-surface, #1a1d27)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <span className="text-sm font-semibold tracking-tight leading-none select-none">
                <span style={{ color: 'var(--palette-primary, #0ea5e9)' }}>nav</span>
                <span className="text-white/50">hub</span>
              </span>
              <div className="h-4 w-px bg-white/15" />
              {groupName && (
                <span className="text-xs text-white/60 truncate max-w-[140px]">{groupName}</span>
              )}
              <div className="h-4 w-px bg-white/15" />
              <span className="text-xs text-white/40 truncate flex-1">{reportName}</span>
              <div className="ml-auto flex items-center gap-3 flex-shrink-0">
                <a
                  href={`/view/report/${params.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/40 hover:text-white/70 transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <Link
                  href="/reports/custom"
                  className="text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  Back to Library
                </Link>
              </div>
            </div>

            {/* Edit mode amber banner */}
            {editMode && (
              <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-400 flex items-center gap-2 flex-shrink-0">
                <Pencil className="h-3 w-3" />
                Edit mode — click any text to edit it directly. Click Save Changes when done.
              </div>
            )}

            {/* Report iframe */}
            <iframe
              ref={iframeRef}
              src={fileUrl}
              title={reportName || 'Custom Report'}
              className="w-full flex-1 border-0 bg-white"
              sandbox="allow-scripts allow-same-origin"
            />
          </>
        )}
      </div>
    </div>
  )
}
