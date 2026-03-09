'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  FileText, Upload, Plus, X, Check, Loader2, BookOpen,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button }    from '@/components/ui/button'
import { Input }     from '@/components/ui/input'
import { Label }     from '@/components/ui/label'
import { Badge }     from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CustomReport } from '@/lib/types'

const MAX_FILE_MB = 5
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

// ─── Reports Library Page ─────────────────────────────────────────────────────

export default function ReportsLibraryPage() {
  const [reports,  setReports]  = useState<CustomReport[]>([])
  const [loading,  setLoading]  = useState(true)
  const [isAdmin,  setIsAdmin]  = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  // ── Upload form state ────────────────────────────────────────────────────
  const [file,         setFile]         = useState<File | null>(null)
  const [reportName,   setReportName]   = useState('')
  const [description,  setDescription]  = useState('')
  const [uploading,    setUploading]    = useState(false)
  const [uploadToast,  setUploadToast]  = useState<string | null>(null)
  const [dragOver,     setDragOver]     = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load reports + admin status ──────────────────────────────────────────

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const [rRes, gRes] = await Promise.all([
        fetch('/api/reports/custom'),
        fetch('/api/groups/active'),
      ])
      const rJson = await rRes.json()
      const gJson = await gRes.json()
      if (rJson.data) setReports(rJson.data)
      if (gJson.data) setIsAdmin(gJson.data.is_admin)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadReports() }, [loadReports])

  useEffect(() => {
    if (!uploadToast) return
    const t = setTimeout(() => setUploadToast(null), 4000)
    return () => clearTimeout(t)
  }, [uploadToast])

  // ── File handling ────────────────────────────────────────────────────────

  function handleFileSelect(selected: File | null) {
    if (!selected) return
    if (!selected.name.endsWith('.html') && !selected.name.endsWith('.htm')) {
      setUploadToast('Only .html files are supported')
      return
    }
    if (selected.size > MAX_FILE_BYTES) {
      setUploadToast(`File must be under ${MAX_FILE_MB} MB`)
      return
    }
    setFile(selected)
    if (!reportName) {
      // Auto-fill name from filename (strip extension, replace hyphens/underscores)
      setReportName(
        selected.name
          .replace(/\.(html?)/i, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())
      )
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFileSelect(dropped)
  }

  async function handleUpload() {
    if (!file || !reportName.trim()) {
      setUploadToast('Report name and file are required')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file',        file)
      form.append('name',        reportName.trim())
      form.append('description', description.trim())

      const res  = await fetch('/api/reports/custom', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')

      setReports(rs => [...rs, json.data])
      setFile(null)
      setReportName('')
      setDescription('')
      setShowUpload(false)
      setUploadToast(`"${json.data.name}" uploaded successfully`)
    } catch (err) {
      setUploadToast(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(report: CustomReport) {
    if (!confirm(`Delete "${report.name}"? This cannot be undone.`)) return
    try {
      const res  = await fetch(`/api/reports/custom/${report.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to delete')
      setReports(rs => rs.filter(r => r.id !== report.id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6" /> Reports Library
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Custom HTML reports uploaded by your group admins
          </p>
        </div>
        {isAdmin && !showUpload && (
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Upload report
          </Button>
        )}
      </div>

      {/* Global toast */}
      {uploadToast && (
        <div className={cn(
          'flex items-center gap-2 rounded-md px-4 py-2.5 text-sm',
          uploadToast.includes('success') || uploadToast.includes('successfully')
            ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
            : 'bg-destructive/10 text-destructive border border-destructive/20'
        )}>
          {(uploadToast.includes('success') || uploadToast.includes('successfully'))
            ? <Check className="h-4 w-4 shrink-0" />
            : <X className="h-4 w-4 shrink-0" />}
          {uploadToast}
        </div>
      )}

      {/* Upload panel */}
      {showUpload && isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">Upload Report</CardTitle>
                <CardDescription>HTML files only · Max {MAX_FILE_MB} MB</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => { setShowUpload(false); setFile(null); setReportName(''); setDescription('') }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Dropzone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30',
                file && 'border-green-500 bg-green-50 dark:bg-green-950/30'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                className="hidden"
                onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="space-y-1">
                  <Check className="h-8 w-8 text-green-500 mx-auto" />
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop an HTML file, or <span className="text-primary font-medium">browse</span>
                  </p>
                </div>
              )}
            </div>

            {/* Name + description */}
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="report-name">Report name <span className="text-destructive">*</span></Label>
                <Input
                  id="report-name"
                  value={reportName}
                  onChange={e => setReportName(e.target.value)}
                  placeholder="Q1 2026 Financial Summary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-desc">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  id="report-desc"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Brief description of this report"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleUpload} disabled={uploading || !file}>
                {uploading ? (
                  <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading…</>
                ) : (
                  <><Upload className="h-4 w-4 mr-1.5" /> Upload</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowUpload(false); setFile(null); setReportName(''); setDescription('') }}
                disabled={uploading}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reports grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 space-y-3">
                <div className="h-10 w-10 rounded-lg bg-muted" />
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-base font-medium text-muted-foreground">No reports yet</p>
            {isAdmin ? (
              <p className="text-sm text-muted-foreground mt-1">
                Upload your first HTML report using the button above.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                Your group admins haven&apos;t uploaded any reports yet.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map(report => (
            <Card
              key={report.id}
              className="group relative hover:border-primary/50 transition-colors"
            >
              <CardContent className="p-5 space-y-3">
                {/* Icon + badge */}
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="outline" className="text-xs uppercase tracking-wide">
                    {report.file_type}
                  </Badge>
                </div>

                {/* Name + description */}
                <div>
                  <p className="text-sm font-semibold leading-snug">{report.name}</p>
                  {report.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {report.description}
                    </p>
                  )}
                </div>

                {/* Date */}
                <p className="text-xs text-muted-foreground">
                  Added {new Date(report.created_at).toLocaleDateString()}
                </p>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="flex-1" asChild>
                    <Link href={`/reports/custom/${report.id}`}>Open</Link>
                  </Button>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDelete(report)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
