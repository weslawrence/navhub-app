'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, FolderOpen, FileText, Sparkles, Lock, Share2, MoreHorizontal,
  Folder, Trash2, MoveRight, Search, SlidersHorizontal, Upload,
  LayoutTemplate, Tag, ChevronDown,
} from 'lucide-react'
import { Button }   from '@/components/ui/button'
import { cn }       from '@/lib/utils'
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_AUDIENCE_LABELS,
  type Document,
  type DocumentFolder,
  type DocumentType,
  type Company,
} from '@/lib/types'
import NewDocumentModal    from '@/components/documents/NewDocumentModal'
import UploadDropzone      from '@/components/documents/UploadDropzone'

// ─── Helpers ────────────────────────────────────────────────────────────────

function docTypeBadgeClass(t: DocumentType) {
  const map: Record<string, string> = {
    financial_analysis: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    cash_flow_review:   'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300',
    board_report:       'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
    budget_vs_actual:   'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    job_description:    'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
    org_structure:      'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300',
    entity_relationship:'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
    business_health:    'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
    tax_position:       'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    due_diligence:      'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
    investor_briefing:  'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
  }
  return `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[t] ?? 'bg-muted text-muted-foreground'}`
}

function audienceBadgeClass(a: string) {
  const map: Record<string, string> = {
    board:      'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    management: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400',
    investor:   'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400',
    internal:   'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    hr:         'bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400',
    external:   'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400',
  }
  return `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[a] ?? 'bg-muted text-muted-foreground'}`
}

// ─── Document Card ───────────────────────────────────────────────────────────

interface DocWithMeta extends Document { locked_by_email?: string | null }

function DocumentCard({
  doc,
  companies,
  onDelete,
  onMoveToFolder,
  folders,
  isAdmin,
}: {
  doc:           DocWithMeta
  companies:     Company[]
  folders:       DocumentFolder[]
  onDelete:      (id: string) => void
  onMoveToFolder:(id: string, folderId: string | null) => void
  isAdmin:       boolean
}) {
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [moveOpen,   setMoveOpen]   = useState(false)

  const company  = companies.find(c => c.id === doc.company_id)
  const lockName = doc.locked_by_email?.split('@')[0] ?? 'Someone'
  const isLocked = !!doc.locked_by

  return (
    <div className="relative group rounded-xl border bg-card hover:shadow-md transition-shadow flex flex-col">
      <Link href={`/documents/${doc.id}`} className="flex-1 p-4 space-y-3">
        {/* Title row */}
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <h3 className="font-medium text-sm leading-snug line-clamp-2 text-foreground">{doc.title}</h3>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          <span className={docTypeBadgeClass(doc.document_type)}>
            {DOCUMENT_TYPE_LABELS[doc.document_type]}
          </span>
          <span className={audienceBadgeClass(doc.audience)}>
            {DOCUMENT_AUDIENCE_LABELS[doc.audience]}
          </span>
          {doc.status === 'published' && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
              Published
            </span>
          )}
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {company && <span>{company.name}</span>}
          <span className="ml-auto">{new Date(doc.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-2">
          {doc.agent_run_id && (
            <span title="Created by agent"><Sparkles className="h-3.5 w-3.5 text-primary" /></span>
          )}
          {isLocked && (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Lock className="h-3 w-3" /> Editing — {lockName}
            </span>
          )}
          {doc.is_shareable && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 ml-auto">
              <Share2 className="h-3 w-3" /> Shared
            </span>
          )}
        </div>
      </Link>

      {/* Three-dot menu */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative">
          <button
            onClick={e => { e.preventDefault(); setMenuOpen(o => !o) }}
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
          >
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => { setMenuOpen(false); setMoveOpen(false) }} />
              <div className="absolute right-0 top-7 z-20 bg-background border rounded-lg shadow-lg py-1 w-48 text-sm">
                <Link
                  href={`/documents/${doc.id}`}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  <FileText className="h-3.5 w-3.5" /> Open
                </Link>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left"
                  onClick={() => { setMoveOpen(o => !o) }}
                >
                  <MoveRight className="h-3.5 w-3.5" /> Move to Folder
                </button>
                {moveOpen && (
                  <div className="pl-6 pb-1 space-y-0.5">
                    <button
                      className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground"
                      onClick={() => { onMoveToFolder(doc.id, null); setMenuOpen(false) }}
                    >
                      Unfiled
                    </button>
                    {folders.map(f => (
                      <button
                        key={f.id}
                        className="w-full text-left px-2 py-1 text-xs rounded hover:bg-muted"
                        onClick={() => { onMoveToFolder(doc.id, f.id); setMenuOpen(false) }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}
                {isAdmin && (
                  <>
                    <div className="border-t my-1" />
                    <button
                      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-left text-destructive"
                      onClick={() => { onDelete(doc.id); setMenuOpen(false) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [documents,  setDocuments]  = useState<DocWithMeta[]>([])
  const [folders,    setFolders]    = useState<DocumentFolder[]>([])
  const [companies,  setCompanies]  = useState<Company[]>([])
  const [loading,    setLoading]    = useState(true)
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [showModal,  setShowModal]  = useState(false)

  // Upload state
  const [uploading,       setUploading]       = useState(false)
  const [uploadProgress,  setUploadProgress]  = useState<Record<string, number>>({})
  const [uploadErrors,    setUploadErrors]    = useState<Record<string, string>>({})

  // Filter state
  const [activeFolder,  setActiveFolder]  = useState<string | null>(null) // null=all, 'unfiled'=unfiled, <id>=folder
  const [filterType,    setFilterType]    = useState('')
  const [filterCompany, setFilterCompany] = useState('')
  const [search,        setSearch]        = useState('')

  // Tag filter state
  const [allTags,       setAllTags]       = useState<string[]>([])
  const [selectedTags,  setSelectedTags]  = useState<string[]>([])
  const [tagDropOpen,   setTagDropOpen]   = useState(false)

  // New folder inline form
  const [newFolderName, setNewFolderName] = useState('')
  const [addingFolder,  setAddingFolder]  = useState(false)
  const [folderLoading, setFolderLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [docsRes, foldersRes, companiesRes, roleRes, tagsRes] = await Promise.all([
        fetch('/api/documents'),
        fetch('/api/documents/folders'),
        fetch('/api/companies'),
        fetch('/api/groups/active'),
        fetch('/api/documents/tags'),
      ])
      const [docsJson, foldersJson, companiesJson, roleJson, tagsJson] = await Promise.all([
        docsRes.json(), foldersRes.json(), companiesRes.json(), roleRes.json(), tagsRes.json(),
      ])
      setDocuments(docsJson.data ?? [])
      setFolders(foldersJson.data ?? [])
      setCompanies((companiesJson.data ?? []).filter((c: Company) => c.is_active))
      const role = roleJson.data?.role as string | undefined
      setIsAdmin(role === 'super_admin' || role === 'group_admin')
      setAllTags(tagsJson.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  async function handleDelete(id: string) {
    if (!confirm('Delete this document? This cannot be undone.')) return
    await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    setDocuments(prev => prev.filter(d => d.id !== id))
  }

  async function handleMoveToFolder(docId: string, folderId: string | null) {
    await fetch(`/api/documents/${docId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ folder_id: folderId }),
    })
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, folder_id: folderId } : d))
  }

  async function handleAddFolder() {
    if (!newFolderName.trim()) return
    setFolderLoading(true)
    try {
      const res  = await fetch('/api/documents/folders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: newFolderName.trim() }),
      })
      const json = await res.json()
      if (res.ok) {
        setFolders(prev => [...prev, json.data])
        setNewFolderName('')
        setAddingFolder(false)
      }
    } finally {
      setFolderLoading(false)
    }
  }

  async function handleUpload(files: File[]) {
    setUploading(true)
    setUploadErrors({})
    const newProgress: Record<string, number> = {}
    files.forEach(f => { newProgress[f.name] = 0 })
    setUploadProgress(newProgress)

    for (const file of files) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res  = await fetch('/api/documents/upload', { method: 'POST', body: formData })
        const json = await res.json() as { data?: { document: DocWithMeta }; error?: string }
        if (!res.ok) {
          setUploadErrors(prev => ({ ...prev, [file.name]: json.error ?? 'Upload failed' }))
        } else if (json.data?.document) {
          setDocuments(prev => [json.data!.document, ...prev])
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }))
        }
      } catch {
        setUploadErrors(prev => ({ ...prev, [file.name]: 'Network error' }))
      }
    }
    setUploading(false)
    // Clear progress after a moment
    setTimeout(() => setUploadProgress({}), 2000)
  }

  // Apply filters
  const filtered = documents.filter(doc => {
    if (activeFolder === 'unfiled' && doc.folder_id !== null) return false
    if (activeFolder && activeFolder !== 'unfiled' && doc.folder_id !== activeFolder) return false
    if (filterType    && doc.document_type !== filterType)   return false
    if (filterCompany && doc.company_id    !== filterCompany) return false
    if (search) {
      const q = search.toLowerCase()
      const tags = doc.tags ?? []
      if (!doc.title.toLowerCase().includes(q) && !tags.some(t => t.includes(q))) return false
    }
    if (selectedTags.length > 0) {
      const docTags = doc.tags ?? []
      if (!selectedTags.every(t => docTags.includes(t))) return false
    }
    return true
  })

  // Count per folder
  const countAll    = documents.length
  const countUnfiled = documents.filter(d => !d.folder_id).length
  const folderCounts = folders.reduce<Record<string, number>>((acc, f) => {
    acc[f.id] = documents.filter(d => d.folder_id === f.id).length
    return acc
  }, {})

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      {/* ── Left sidebar ── */}
      <aside className="hidden lg:flex flex-col w-52 border-r shrink-0 py-4 px-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">Folders</p>

        {/* All Documents */}
        <button
          onClick={() => setActiveFolder(null)}
          className={cn(
            'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-left transition-colors',
            activeFolder === null ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">All Documents</span>
          <span className="text-xs text-muted-foreground">{countAll}</span>
        </button>

        {/* Unfiled */}
        <button
          onClick={() => setActiveFolder('unfiled')}
          className={cn(
            'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-left transition-colors',
            activeFolder === 'unfiled' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          <Folder className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">Unfiled</span>
          <span className="text-xs text-muted-foreground">{countUnfiled}</span>
        </button>

        {/* Templates folder — pinned at top */}
        {folders.filter(f => f.folder_type === 'templates').map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFolder(f.id)}
            className={cn(
              'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-left transition-colors',
              activeFolder === f.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <LayoutTemplate className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{f.name}</span>
            <span className="text-xs text-muted-foreground">{folderCounts[f.id] ?? 0}</span>
          </button>
        ))}

        {/* Regular folders */}
        {folders.filter(f => f.folder_type !== 'templates').map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFolder(f.id)}
            className={cn(
              'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm text-left transition-colors',
              activeFolder === f.id ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Folder className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{f.name}</span>
            <span className="text-xs text-muted-foreground">{folderCounts[f.id] ?? 0}</span>
          </button>
        ))}

        {/* Add folder */}
        {isAdmin && (
          <div className="pt-2 border-t mt-2">
            {addingFolder ? (
              <div className="space-y-1.5">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleAddFolder(); if (e.key === 'Escape') setAddingFolder(false) }}
                  placeholder="Folder name…"
                  className="flex h-7 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <div className="flex gap-1">
                  <Button size="sm" className="h-6 text-xs flex-1" onClick={() => void handleAddFolder()} disabled={folderLoading}>
                    {folderLoading ? '…' : 'Add'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setAddingFolder(false)}>×</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingFolder(true)}
                className="flex items-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors"
              >
                <Plus className="h-3 w-3" /> New Folder
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 min-w-0 px-6 py-6 space-y-5">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">Documents</h1>

          <div className="flex-1 flex items-center gap-2 ml-4">
            {/* Search */}
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="pl-8 flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* Type filter */}
            <div className="flex items-center gap-1">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">All types</option>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            {/* Tag filter */}
            {allTags.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setTagDropOpen(o => !o)}
                  className={cn(
                    'h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground flex items-center gap-1',
                    selectedTags.length > 0 && 'border-primary text-primary'
                  )}
                >
                  <Tag className="h-3 w-3" />
                  Tags
                  {selectedTags.length > 0 && (
                    <span className="ml-0.5 rounded-full bg-primary text-primary-foreground h-4 w-4 text-[10px] flex items-center justify-center">
                      {selectedTags.length}
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </button>
                {tagDropOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setTagDropOpen(false)} />
                    <div className="absolute top-9 left-0 z-20 bg-background border rounded-lg shadow-lg py-1 w-44 max-h-48 overflow-y-auto">
                      {allTags.map(tag => (
                        <label key={tag} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={selectedTags.includes(tag)}
                            onChange={() => {
                              setSelectedTags(prev =>
                                prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                              )
                            }}
                            className="rounded border-input"
                          />
                          {tag}
                        </label>
                      ))}
                      {selectedTags.length > 0 && (
                        <button
                          onClick={() => { setSelectedTags([]); setTagDropOpen(false) }}
                          className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border-t"
                        >
                          Clear tag filters
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Company filter */}
            {companies.length > 0 && (
              <select
                value={filterCompany}
                onChange={e => setFilterCompany(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">All companies</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.multiple = true
              input.accept = '.pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.pptx,.ppt,.html'
              input.onchange = () => { if (input.files) void handleUpload(Array.from(input.files)) }
              input.click()
            }} className="gap-1.5" disabled={uploading}>
              <Upload className="h-4 w-4" /> Upload
            </Button>
            <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> New Document
            </Button>
          </div>
        </div>

        {/* Upload dropzone — compact strip when docs exist */}
        {documents.length > 0 && (
          <UploadDropzone
            onUpload={handleUpload}
            uploading={uploading}
            progress={uploadProgress}
            errors={uploadErrors}
            compact
          />
        )}

        {/* Document grid */}
        {loading ? (
          <div className="flex items-center justify-center min-h-48 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 && documents.length === 0 ? (
          <UploadDropzone
            onUpload={handleUpload}
            uploading={uploading}
            progress={uploadProgress}
            errors={uploadErrors}
            compact={false}
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-48 text-center space-y-3">
            <FileText className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No documents found.</p>
            <Button size="sm" onClick={() => setShowModal(true)} variant="outline">
              <Plus className="h-4 w-4 mr-1" /> Create your first document
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(doc => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                companies={companies}
                folders={folders}
                onDelete={handleDelete}
                onMoveToFolder={handleMoveToFolder}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Document Modal */}
      {showModal && (
        <NewDocumentModal
          folders={folders}
          companies={companies}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); void loadData() }}
        />
      )}
    </div>
  )
}
