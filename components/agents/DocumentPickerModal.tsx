'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Loader2, X, FileText, Check } from 'lucide-react'
import { Input }  from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge }  from '@/components/ui/badge'
import { cn }     from '@/lib/utils'

export type PickableSource = 'document' | 'report'

export interface PickableDocument {
  id:            string
  title:         string
  document_type: string
  folder_id:     string | null
  status?:       string
  file_type?:    string | null
  /** When the modal allows toggling between sources, set on each result */
  source?:       PickableSource
}

interface DocumentPickerModalProps {
  onSelect:        (items: PickableDocument[]) => void
  onClose:         () => void
  multiSelect?:    boolean              // default true
  excludeIds?:     string[]             // hide already-attached IDs
  /** When true, render a Documents/Reports source toggle */
  allowReports?:   boolean
}

interface Folder { id: string; name: string }

interface ReportRow { id: string; name: string; description?: string | null; status?: string; file_type?: string | null }

export default function DocumentPickerModal({
  onSelect,
  onClose,
  multiSelect  = true,
  excludeIds   = [],
  allowReports = false,
}: DocumentPickerModalProps) {
  const [source,   setSource]   = useState<PickableSource>('document')
  const [docs,     setDocs]     = useState<PickableDocument[]>([])
  const [folders,  setFolders]  = useState<Folder[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [folderId, setFolderId] = useState<string>('')   // '' = all
  const [picked,   setPicked]   = useState<Set<string>>(new Set())

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    try {
      const [dRes, fRes] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/documents/folders'),
      ])
      const dJson = await dRes.json() as { data?: PickableDocument[] }
      const fJson = await fRes.json() as { data?: Folder[] }
      setDocs((dJson.data ?? [])
        .filter(d => !excludeIds.includes(d.id))
        .map(d => ({ ...d, source: 'document' as const })))
      setFolders(fJson.data ?? [])
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/reports/custom')
      const json = await res.json() as { data?: ReportRow[] }
      const items = (json.data ?? [])
        .filter(r => !excludeIds.includes(r.id))
        .map<PickableDocument>(r => ({
          id:            r.id,
          title:         r.name,
          document_type: 'report',
          folder_id:     null,
          status:        r.status ?? undefined,
          file_type:     r.file_type ?? null,
          source:        'report',
        }))
      setDocs(items)
      setFolders([])    // no folder filter for reports
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setPicked(new Set())
    setSearch('')
    setFolderId('')
    if (source === 'document') void loadDocuments()
    else                         void loadReports()
  }, [source, loadDocuments, loadReports])

  const filtered = docs.filter(d => {
    if (source === 'document') {
      if (folderId === '__unfiled' && d.folder_id !== null) return false
      if (folderId && folderId !== '__unfiled' && d.folder_id !== folderId) return false
    }
    if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function toggle(id: string) {
    if (multiSelect) {
      setPicked(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else              next.add(id)
        return next
      })
    } else {
      const item = docs.find(d => d.id === id)
      if (item) onSelect([item])
    }
  }

  function confirmSelection() {
    const selected = docs.filter(d => picked.has(d.id))
    onSelect(selected)
  }

  const itemNoun = source === 'report' ? 'report' : 'document'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-background border rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-base font-semibold">
            Link from {allowReports ? 'NavHub' : 'Documents'}
          </h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        {/* Source toggle (Documents / Reports) */}
        {allowReports && (
          <div className="px-5 pt-3">
            <div className="flex border rounded-md overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setSource('document')}
                className={cn(
                  'flex-1 px-3 py-1.5 transition-colors',
                  source === 'document' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                Documents
              </button>
              <button
                type="button"
                onClick={() => setSource('report')}
                className={cn(
                  'flex-1 px-3 py-1.5 transition-colors',
                  source === 'report' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                Reports
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="px-5 py-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${itemNoun}s…`}
              className="pl-8 text-sm"
            />
          </div>
          {source === 'document' && (
            <select
              value={folderId}
              onChange={e => setFolderId(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">All folders</option>
              <option value="__unfiled">Unfiled</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No {itemNoun}s match.</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map(d => {
                const checked = picked.has(d.id)
                return (
                  <li key={d.id}>
                    <button
                      onClick={() => toggle(d.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm transition-colors',
                        checked ? 'bg-primary/10' : 'hover:bg-muted',
                      )}
                    >
                      {multiSelect && (
                        <span className={cn(
                          'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                          checked ? 'bg-primary border-primary' : 'border-muted-foreground/40',
                        )}>
                          {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                        </span>
                      )}
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{d.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{d.document_type}</Badge>
                      {d.status && <Badge variant="outline" className="text-[10px] shrink-0">{d.status}</Badge>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        {multiSelect && (
          <div className="px-5 py-3 border-t flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {picked.size > 0 ? `${picked.size} selected` : `Pick one or more ${itemNoun}s`}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={confirmSelection} disabled={picked.size === 0}>
                Add {picked.size > 0 ? `${picked.size} ` : ''}{picked.size === 1 ? itemNoun : `${itemNoun}s`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
