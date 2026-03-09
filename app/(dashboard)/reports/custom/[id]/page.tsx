'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Download, Trash2, Loader2, AlertCircle, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn }     from '@/lib/utils'

// ─── Report Viewer Page ───────────────────────────────────────────────────────

export default function ReportViewerPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [signedUrl, setSignedUrl]   = useState<string | null>(null)
  const [reportName, setReportName] = useState<string>('')
  const [isAdmin,   setIsAdmin]     = useState(false)
  const [loading,   setLoading]     = useState(true)
  const [error,     setError]       = useState<string | null>(null)
  const [deleting,  setDeleting]    = useState(false)

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
      if (groupJson.data) setIsAdmin(groupJson.data.is_admin)
      setSignedUrl('ready') // just a truthy flag to show the iframe
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

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)]" style={{ minHeight: 0 }}>
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
          {signedUrl && (
            <>
              <Button variant="outline" size="sm" asChild>
                <a href={signedUrl} download={reportName || 'report.html'} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4 mr-1.5" /> Download
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={signedUrl} target="_blank" rel="noreferrer">
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
        'flex-1 rounded-lg border bg-white dark:bg-gray-950 overflow-hidden',
        (loading || error) && 'flex items-center justify-center'
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

        {signedUrl && !loading && !error && (
          <iframe
            src={`/api/reports/custom/${params.id}/file`}
            title={reportName || 'Custom Report'}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>
    </div>
  )
}
