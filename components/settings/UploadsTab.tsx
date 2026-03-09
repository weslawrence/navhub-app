'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { FileSpreadsheet, Download, Upload, Trash2, RefreshCw, Check, AlertCircle } from 'lucide-react'
import { Button }   from '@/components/ui/button'
import { Label }    from '@/components/ui/label'
import { Badge }    from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import PeriodSelector from '@/components/ui/PeriodSelector'
import { getCurrentPeriod } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportTypeKey = 'pl' | 'bs' | 'tb'

interface CompanyOption  { id: string; name: string }
interface DivisionOption { id: string; name: string; company_id: string; company_name: string }

interface UploadRow {
  id:           string
  company_id:   string | null
  division_id:  string | null
  report_type:  string | null
  period_value: string | null
  filename:     string
  status:       string
  uploaded_at:  string
  error_message: string | null
  company?:     { name: string }
  division?:    { name: string }
}

const REPORT_TYPE_OPTIONS: { value: ReportTypeKey; label: string }[] = [
  { value: 'pl', label: 'Profit & Loss' },
  { value: 'bs', label: 'Balance Sheet' },
  { value: 'tb', label: 'Trial Balance' },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface UploadsTabProps {
  isAdmin:     boolean
  fyEndMonth?: number
}

export default function UploadsTab({ isAdmin, fyEndMonth = 6 }: UploadsTabProps) {
  const [companies,    setCompanies]    = useState<CompanyOption[]>([])
  const [divisions,    setDivisions]    = useState<DivisionOption[]>([])
  const [uploads,      setUploads]      = useState<UploadRow[]>([])
  const [loadingData,  setLoadingData]  = useState(true)

  // Upload form state
  const [entityValue,  setEntityValue]  = useState('')
  const [reportType,   setReportType]   = useState<ReportTypeKey>('pl')
  const [period,       setPeriod]       = useState(getCurrentPeriod())
  const [uploadFile,   setUploadFile]   = useState<File | null>(null)
  const [uploading,    setUploading]    = useState(false)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [uploadMsg,    setUploadMsg]    = useState('')
  const [deleteId,     setDeleteId]     = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoadingData(true)
    try {
      const cRes  = await fetch('/api/companies?include_inactive=false')
      const cJson = await cRes.json()
      const companyList: CompanyOption[] = cJson.data ?? []
      setCompanies(companyList)

      if (companyList.length > 0) {
        const divResps = await Promise.all(
          companyList.map(c => fetch(`/api/divisions?company_id=${c.id}`).then(r => r.json()))
        )
        const divs: DivisionOption[] = []
        companyList.forEach((c, i) => {
          const rows = divResps[i]?.data ?? []
          rows.forEach((d: { id: string; name: string; company_id: string }) => {
            divs.push({ ...d, company_name: c.name })
          })
        })
        setDivisions(divs)
      }

      const uRes  = await fetch('/api/uploads')
      const uJson = await uRes.json()
      setUploads(uJson.data ?? [])
    } catch { /* silent */ } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  // Auto-clear upload status
  useEffect(() => {
    if (uploadStatus === 'idle') return
    const t = setTimeout(() => setUploadStatus('idle'), 4000)
    return () => clearTimeout(t)
  }, [uploadStatus])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleDownloadTemplate() {
    window.open(`/api/uploads/template?type=${reportType}`, '_blank')
  }

  async function handleUpload() {
    if (!uploadFile || !entityValue) return

    const [entityType, entityId] = entityValue.split('::')
    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('entity_type', entityType)
    formData.append('entity_id',   entityId)
    formData.append('report_type', reportType)
    formData.append('period_value', period)

    setUploading(true)
    setUploadStatus('idle')
    try {
      const res  = await fetch('/api/uploads/process', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')
      setUploadStatus('success')
      setUploadMsg(`Uploaded ${uploadFile.name} successfully`)
      setUploadFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      void loadData()
    } catch (err) {
      setUploadStatus('error')
      setUploadMsg(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(uploadId: string) {
    try {
      const res  = await fetch(`/api/uploads/${uploadId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to delete')
      setUploads(us => us.filter(u => u.id !== uploadId))
      setDeleteId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
      setDeleteId(null)
    }
  }

  const entityName = (u: UploadRow) =>
    u.company?.name ?? u.division?.name ?? 'Unknown entity'

  return (
    <div className="space-y-6">

      {/* ── Upload form ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Upload Financial Data
          </CardTitle>
          <CardDescription>
            Download the template, fill in your data, then upload it here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Step 1 — Entity */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">1. Select entity</Label>
            <div className="relative">
              <select
                value={entityValue}
                onChange={e => setEntityValue(e.target.value)}
                className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select company or division…</option>
                {companies.length > 0 && (
                  <optgroup label="Companies">
                    {companies.map(c => (
                      <option key={c.id} value={`company::${c.id}`}>{c.name}</option>
                    ))}
                  </optgroup>
                )}
                {divisions.length > 0 && (
                  <optgroup label="Divisions">
                    {divisions.map(d => (
                      <option key={d.id} value={`division::${d.id}`}>
                        {d.name} ({d.company_name})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* Step 2 — Report type */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">2. Report type</Label>
            <div className="flex gap-2">
              {REPORT_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setReportType(opt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    reportType === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 3 — Period */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">3. Period</Label>
            <PeriodSelector
              value={period}
              onChange={setPeriod}
              fyEndMonth={fyEndMonth}
              modes={['month', 'quarter', 'fy_year']}
            />
          </div>

          {/* Step 4 — Download template */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">4. Download template</Label>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Download {REPORT_TYPE_OPTIONS.find(o => o.value === reportType)?.label} template
            </button>
          </div>

          {/* Step 5 — Upload */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">5. Upload completed file</Label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                className="flex-1 text-sm text-foreground file:mr-2 file:text-xs file:font-medium file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-foreground hover:file:bg-muted/80"
              />
              <Button
                size="sm"
                onClick={handleUpload}
                disabled={!uploadFile || !entityValue || uploading}
              >
                {uploading
                  ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" />
                  : <Upload className="h-3.5 w-3.5 mr-1" />}
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
            {uploadFile && (
              <p className="text-xs text-muted-foreground">
                Selected: <span className="font-medium text-foreground">{uploadFile.name}</span>
              </p>
            )}
          </div>

          {/* Upload status */}
          {uploadStatus !== 'idle' && (
            <div className={`flex items-center gap-2 text-xs p-2 rounded-md ${
              uploadStatus === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
            }`}>
              {uploadStatus === 'success'
                ? <Check className="h-3.5 w-3.5 shrink-0" />
                : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              {uploadMsg}
            </div>
          )}

        </CardContent>
      </Card>

      {/* ── Previous uploads ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Previous Uploads</h3>
          <button
            type="button"
            onClick={() => void loadData()}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loadingData ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : uploads.length === 0 ? (
          <p className="text-sm text-muted-foreground">No uploads yet.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Entity</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground hidden md:table-cell">Period</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground hidden lg:table-cell">Uploaded</th>
                  {isAdmin && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {uploads.map(u => (
                  <tr key={u.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <p className="text-xs font-medium text-foreground">{entityName(u)}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[120px]">{u.filename}</p>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="text-xs text-foreground uppercase">{u.report_type ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <span className="text-xs text-foreground">{u.period_value ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={u.status === 'processed' ? 'success' : 'error'} className="text-xs">
                        {u.status}
                      </Badge>
                      {u.error_message && (
                        <p className="text-xs text-destructive mt-0.5 truncate max-w-[120px]">{u.error_message}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">
                        {new Date(u.uploaded_at).toLocaleDateString('en-AU')}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2.5">
                        {deleteId === u.id ? (
                          <span className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-6 text-xs px-2"
                              onClick={() => void handleDelete(u.id)}
                            >
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs px-2"
                              onClick={() => setDeleteId(null)}
                            >
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(u.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
