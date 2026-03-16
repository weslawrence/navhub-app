'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft, Edit3, Save, X, Lock, Eye, EyeOff,
  History, RotateCcw, Share2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn }     from '@/lib/utils'
import {
  DOCUMENT_TYPE_LABELS, DOCUMENT_AUDIENCE_LABELS,
  type Document, type DocumentVersion,
} from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface DocWithEmail extends Document { locked_by_email?: string | null }

// ─── Markdown renderer ──────────────────────────────────────────────────────

function MarkdownView({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <div className="text-muted-foreground text-sm italic text-center py-12">
        This document has no content yet. Click Edit to start writing.
      </div>
    )
  }
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

// ─── Share Popover ──────────────────────────────────────────────────────────

function SharePopover({ docId, isAdmin, onClose }: { docId: string; isAdmin: boolean; onClose: () => void }) {
  const [loading,   setLoading]   = useState(true)
  const [shared,    setShared]    = useState(false)
  const [shareUrl,  setShareUrl]  = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [copied,    setCopied]    = useState(false)
  const [working,   setWorking]   = useState(false)

  useEffect(() => {
    fetch(`/api/documents/${docId}/share`)
      .then(r => r.json())
      .then(j => {
        setShared(j.data?.is_shareable ?? false)
        setShareUrl(j.data?.share_url ?? null)
        setCreatedAt(j.data?.created_at ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [docId])

  async function generate() {
    setWorking(true)
    const res  = await fetch(`/api/documents/${docId}/share`, { method: 'POST' })
    const json = await res.json()
    setShared(true)
    setShareUrl(json.data?.share_url ?? null)
    setCreatedAt(json.data?.created_at ?? null)
    setWorking(false)
  }

  async function revoke() {
    if (!confirm('Revoke share link? Anyone with the current link will lose access.')) return
    setWorking(true)
    await fetch(`/api/documents/${docId}/share`, { method: 'DELETE' })
    setShared(false)
    setShareUrl(null)
    setCreatedAt(null)
    setWorking(false)
  }

  function copyUrl() {
    if (!shareUrl) return
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end pt-16 pr-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-background border rounded-xl shadow-2xl w-80 p-4 space-y-3 z-50">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">Share Document</p>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !isAdmin ? (
          <p className="text-sm text-muted-foreground">Admin access required to manage sharing.</p>
        ) : !shared ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">This document is private.</p>
            <Button size="sm" className="w-full" onClick={() => void generate()} disabled={working}>
              {working ? 'Generating…' : 'Generate share link'}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <input
                readOnly value={shareUrl ?? ''}
                className="flex-1 h-7 rounded-md border border-input bg-muted px-2 text-xs text-foreground focus:outline-none"
              />
              <Button size="sm" className="h-7 text-xs" onClick={copyUrl}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            {createdAt && (
              <p className="text-xs text-muted-foreground">
                Created {new Date(createdAt).toLocaleDateString('en-AU')}
              </p>
            )}
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Anyone with this link can view the document without logging in.
            </p>
            <button
              className="text-xs text-destructive hover:underline"
              onClick={() => void revoke()}
              disabled={working}
            >
              {working ? 'Revoking…' : 'Revoke link'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentPage() {
  const params       = useParams()
  const searchParams = useSearchParams()
  const docId        = params.id as string

  const [doc,        setDoc]        = useState<DocWithEmail | null>(null)
  const [versions,   setVersions]   = useState<DocumentVersion[]>([])
  const [loading,    setLoading]    = useState(true)
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [editing,    setEditing]    = useState(false)
  const [draft,      setDraft]      = useState('')
  const [wordCount,  setWordCount]  = useState(0)
  const [saving,     setSaving]     = useState(false)
  const [lockError,  setLockError]  = useState<string | null>(null)
  const [showHistory,setShowHistory] = useState(false)
  const [showShare,  setShowShare]  = useState(false)
  const [showPreview,setShowPreview] = useState(true)

  // Lock keepalive interval
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const editingRef   = useRef(false)
  editingRef.current = editing

  const loadDoc = useCallback(async () => {
    const [docRes, roleRes] = await Promise.all([
      fetch(`/api/documents/${docId}`),
      fetch('/api/groups/active'),
    ])
    const [docJson, roleJson] = await Promise.all([docRes.json(), roleRes.json()])
    if (docJson.data) setDoc(docJson.data)
    const role = roleJson.data?.role as string | undefined
    setIsAdmin(role === 'super_admin' || role === 'group_admin')
    setLoading(false)
  }, [docId])

  const loadVersions = useCallback(async () => {
    const res  = await fetch(`/api/documents/${docId}/versions`)
    const json = await res.json()
    setVersions(json.data ?? [])
  }, [docId])

  useEffect(() => { void loadDoc() }, [loadDoc])

  // Auto-enter edit mode if ?edit=1
  useEffect(() => {
    if (searchParams?.get('edit') === '1' && doc && !editing) {
      void handleEnterEdit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])

  // Lock keepalive — re-POST every 10 minutes while editing
  useEffect(() => {
    if (editing) {
      keepaliveRef.current = setInterval(() => {
        void fetch(`/api/documents/${docId}/lock`, { method: 'POST' }).catch(() => {})
      }, 10 * 60 * 1000)
    }
    return () => {
      if (keepaliveRef.current) clearInterval(keepaliveRef.current)
    }
  }, [editing, docId])

  // Auto-release lock on page unload
  useEffect(() => {
    function handleUnload() {
      if (editingRef.current) {
        navigator.sendBeacon(`/api/documents/${docId}/lock`, JSON.stringify({ _method: 'DELETE' }))
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [docId])

  async function handleEnterEdit() {
    setLockError(null)
    // Acquire lock
    const res  = await fetch(`/api/documents/${docId}/lock`, { method: 'POST' })
    const json = await res.json()
    if (res.status === 409) {
      setLockError(`Document is locked by ${(json.locked_by as string) ?? 'another user'}`)
      return
    }
    if (!res.ok) {
      setLockError(json.error ?? 'Could not acquire lock')
      return
    }
    setDraft(doc?.content_markdown ?? '')
    setWordCount(countWords(doc?.content_markdown ?? ''))
    setEditing(true)
  }

  function countWords(text: string) {
    return text.trim() ? text.trim().split(/\s+/).length : 0
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content_markdown: draft, locked_by: null, locked_at: null }),
      })
      if (res.ok) {
        const json = await res.json()
        setDoc(json.data)
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDiscard() {
    // Release lock
    await fetch(`/api/documents/${docId}/lock`, { method: 'DELETE' }).catch(() => {})
    setEditing(false)
  }

  async function handleRestore(version: DocumentVersion) {
    if (!confirm(`Restore version ${version.version}? The current content will be saved as a new version.`)) return
    await fetch(`/api/documents/${docId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content_markdown: version.content_markdown }),
    })
    void loadDoc()
    void loadVersions()
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[40vh] text-sm text-muted-foreground">Loading…</div>
  }
  if (!doc) {
    return <div className="flex items-center justify-center min-h-[40vh] text-sm text-muted-foreground">Document not found.</div>
  }

  const isLocked  = !!doc.locked_by
  const lockName  = doc.locked_by_email?.split('@')[0] ?? 'another user'

  // Lock expiry (30 min from locked_at)
  const lockMinutesLeft = doc.locked_at
    ? Math.max(0, Math.ceil(30 - (Date.now() - new Date(doc.locked_at).getTime()) / 60000))
    : null

  return (
    <div className="flex flex-col min-h-[calc(100vh-3.5rem)]">
      {/* ── Toolbar ── */}
      <div className="border-b px-6 py-3 flex items-center gap-3 flex-wrap">
        <Link href="/documents">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground -ml-2">
            <ArrowLeft className="h-4 w-4" /> Documents
          </Button>
        </Link>

        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{doc.title}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground`}>
              {DOCUMENT_TYPE_LABELS[doc.document_type]}
            </span>
            <span className="text-xs text-muted-foreground">
              {DOCUMENT_AUDIENCE_LABELS[doc.audience]}
            </span>
            <span className="text-xs text-muted-foreground">
              · Updated {new Date(doc.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <span className="text-xs text-muted-foreground">{wordCount} words</span>
              <Button
                size="sm" variant="outline"
                onClick={() => setShowPreview(p => !p)}
                className="gap-1.5"
              >
                {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPreview ? 'Hide preview' : 'Show preview'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void handleDiscard()} disabled={saving}>
                Discard
              </Button>
              <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Saving…' : <><Save className="h-3.5 w-3.5 mr-1" /> Save</>}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm" variant="outline"
                onClick={() => { setShowHistory(h => !h); if (!showHistory) void loadVersions() }}
                className="gap-1.5"
              >
                <History className="h-3.5 w-3.5" /> History
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => setShowShare(s => !s)}
                className="gap-1.5"
              >
                <Share2 className="h-3.5 w-3.5" /> Share
              </Button>
              <Button
                size="sm"
                onClick={() => void handleEnterEdit()}
                disabled={isLocked}
                className="gap-1.5"
              >
                <Edit3 className="h-3.5 w-3.5" /> Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Lock banner ── */}
      {lockError && (
        <div className="bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 px-6 py-2 text-sm text-red-700 dark:text-red-300">
          {lockError}
        </div>
      )}
      {!editing && isLocked && (
        <div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-6 py-2 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
          <Lock className="h-4 w-4 shrink-0" />
          Currently being edited by {lockName}
          {lockMinutesLeft !== null && ` — lock expires in ${lockMinutesLeft} minute${lockMinutesLeft !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex flex-1 min-h-0">
        {/* Content area */}
        <div className={cn('flex-1 min-w-0', editing && showPreview ? 'flex gap-0' : '')}>
          {editing ? (
            <>
              {/* Editor */}
              <div className={cn('flex flex-col', showPreview ? 'w-1/2 border-r' : 'w-full')}>
                <div className="px-3 py-1.5 border-b bg-muted/30 text-xs text-muted-foreground">Markdown</div>
                <textarea
                  value={draft}
                  onChange={e => {
                    setDraft(e.target.value)
                    setWordCount(countWords(e.target.value))
                  }}
                  className="flex-1 w-full resize-none border-0 bg-transparent p-6 font-mono text-sm focus:outline-none focus:ring-0"
                  spellCheck
                  placeholder="Start writing in Markdown…"
                />
              </div>

              {/* Live preview */}
              {showPreview && (
                <div className="w-1/2 overflow-y-auto">
                  <div className="px-3 py-1.5 border-b bg-muted/30 text-xs text-muted-foreground">Preview</div>
                  <div className="p-6">
                    <MarkdownView content={draft} />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-8 max-w-4xl">
              <MarkdownView content={doc.content_markdown} />
            </div>
          )}
        </div>

        {/* Version history panel */}
        {showHistory && !editing && (
          <aside className="w-64 border-l shrink-0 overflow-y-auto">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <p className="text-sm font-medium">Version History</p>
              <button onClick={() => setShowHistory(false)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No saved versions yet.</p>
            ) : (
              <div className="divide-y">
                {versions.map(v => (
                  <div key={v.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Version {v.version}</span>
                      {isAdmin && (
                        <button
                          onClick={() => void handleRestore(v)}
                          className="text-xs text-primary hover:underline flex items-center gap-0.5"
                        >
                          <RotateCcw className="h-3 w-3" /> Restore
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Share popover */}
      {showShare && (
        <SharePopover docId={docId} isAdmin={isAdmin} onClose={() => setShowShare(false)} />
      )}
    </div>
  )
}
