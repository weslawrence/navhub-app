'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Trash2, Eye, Loader2, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface SnapshotMeta {
  id:         string
  company_id: string
  name:       string
  notes:      string | null
  created_by: string
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function CashflowHistoryPage() {
  const params    = useParams()
  const router    = useRouter()
  const companyId = params?.companyId as string

  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [deleting,  setDeleting]  = useState<string | null>(null)

  const loadSnapshots = useCallback(async () => {
    try {
      const res  = await fetch(`/api/cashflow/${companyId}/snapshots`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSnapshots(json.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { loadSnapshots() }, [loadSnapshots])

  async function handleDelete(snapshotId: string, name: string) {
    if (!confirm(`Delete snapshot "${name}"? This cannot be undone.`)) return
    setDeleting(snapshotId)
    try {
      const res = await fetch(`/api/cashflow/${companyId}/snapshots/${snapshotId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setSnapshots(prev => prev.filter(s => s.id !== snapshotId))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/cashflow/${companyId}`} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Snapshot History</h1>
          <p className="text-xs text-muted-foreground">Named versions of past forecasts</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && snapshots.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No snapshots saved yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Use the "Save snapshot" button on the forecast page to save a named version.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && snapshots.length > 0 && (
        <div className="space-y-3">
          {snapshots.map(snap => (
            <Card key={snap.id}>
              <CardContent className="py-4 px-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{snap.name}</p>
                    {snap.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{snap.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{formatDate(snap.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/cashflow/${companyId}/history/${snap.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </Link>
                    <button
                      onClick={() => handleDelete(snap.id, snap.name)}
                      disabled={deleting === snap.id}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      {deleting === snap.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
