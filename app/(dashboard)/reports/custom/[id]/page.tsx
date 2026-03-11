'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter }              from 'next/navigation'
import Link                                  from 'next/link'
import {
  ArrowLeft, Download, Trash2, Loader2, AlertCircle,
  ExternalLink, Share2, Copy, Check, X, Link2, Link2Off,
} from 'lucide-react'
import { Button }    from '@/components/ui/button'
import { cn }        from '@/lib/utils'

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
  reportId:   string
  onClose:    () => void
}) {
  const [status,   setStatus]   = useState<ShareStatus | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [copied,   setCopied]   = useState(false)

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
    } catch {
      // Fallback: select the input text
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="mt-14 mr-4 w-80 rounded-lg border bg-card shadow-lg p-4 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
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
              // Not shared state
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Link2Off className="h-4 w-4 shrink-0" />
                  <p className="text-sm">This report is private.</p>
                </div>
                <Button
                  className="w-full"
                  size="sm"
                  onClick={() => void handleGenerate()}
                  disabled={saving}
                >
                  {saving
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating…</>
                    : <><Link2 className="h-3.5 w-3.5 mr-1.5" /> Generate share link</>}
                </Button>
              </div>
            ) : (
              // Shared state
              <div className="space-y-3">
                {/* Share URL */}
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
                        : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                {/* Date */}
                {status.created_at && (
                  <p className="text-xs text-muted-foreground">
                    Link generated {new Date(status.created_at).toLocaleDateString()}
                  </p>
                )}

                {/* Warning */}
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded px-2.5 py-2">
                  Anyone with this link can view this report without logging in.
                </p>

                {/* Revoke */}
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

  const fileUrl = `/api/reports/custom/${params.id}/file`

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [metaRes, groupRes] = await Promise.all([
          fetch(`/api/reports/custom/${params.id}`),
          fetch('/api/groups/active'),
        ])
        const metaJson  = await metaRes.json()
        const groupJson = await groupRes.json()

        if (!metaRes.ok) {
          throw new Error(metaJson.error ?? 'Report not found')
        }

        setReportName(metaJson.data.name)
        if (groupJson.data) {
          setIsAdmin(groupJson.data.is_admin)
          setGroupName(groupJson.data.group?.name ?? '')
        }
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

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)]" style={{ minHeight: 0 }}>
      {/* Share popover */}
      {showShare && (
        <SharePopover
          reportId={params.id}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 pb-3 flex-shrink-0">
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

              {/* Share button — admin only */}
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
            </>
          )}
          {isAdmin && (
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
              {/* Wordmark */}
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

              {/* Right actions */}
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

            {/* iframe fills remaining height */}
            <iframe
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
