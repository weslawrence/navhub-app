'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileSpreadsheet, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

// ============================================================
// Types
// ============================================================

type EntityType = 'company' | 'division'

interface EntityOption {
  id:   string
  name: string
}

interface UploadResult {
  sheets_found: string[]
  periods:      string[]
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }
  | { status: 'success'; result: UploadResult }
  | { status: 'error'; message: string }

// ============================================================
// Component
// ============================================================

interface ExcelUploadProps {
  companies:  EntityOption[]
  divisions?: EntityOption[]
}

export default function ExcelUpload({ companies, divisions = [] }: ExcelUploadProps) {
  const [entityType,   setEntityType]   = useState<EntityType>('company')
  const [entityId,     setEntityId]     = useState<string>('')
  const [uploadState,  setUploadState]  = useState<UploadState>({ status: 'idle' })

  const entities: EntityOption[] = entityType === 'company' ? companies : divisions
  const step1Done = !!entityId

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (!file || !entityId) return

      setUploadState({ status: 'uploading', progress: 10 })

      const formData = new FormData()
      formData.append('file', file)
      formData.append('entity_type', entityType)
      formData.append('entity_id', entityId)

      try {
        setUploadState({ status: 'uploading', progress: 40 })

        const res = await fetch('/api/excel/upload', {
          method: 'POST',
          body:   formData,
        })

        setUploadState({ status: 'uploading', progress: 80 })

        const json = await res.json()

        if (!res.ok || json.error) {
          setUploadState({ status: 'error', message: json.error ?? 'Upload failed' })
          return
        }

        setUploadState({ status: 'success', result: json.data })
      } catch (err) {
        setUploadState({
          status:  'error',
          message: err instanceof Error ? err.message : 'Network error',
        })
      }
    },
    [entityId, entityType]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxSize:  10 * 1024 * 1024, // 10 MB
    multiple: false,
    disabled: !entityId || uploadState.status === 'uploading',
  })

  function reset() {
    setUploadState({ status: 'idle' })
  }

  // ── Step indicator badge ─────────────────────────────────────────────────

  function StepBadge({ n, done, active }: { n: number; done: boolean; active: boolean }) {
    if (done) {
      return (
        <div className="h-5 w-5 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0">
          <CheckCircle className="h-3.5 w-3.5" />
        </div>
      )
    }
    return (
      <div className={cn(
        'h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0',
        active
          ? 'bg-primary text-white'
          : 'bg-muted text-muted-foreground border border-input'
      )}>
        {n}
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Step 1: Select entity ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <StepBadge n={1} done={step1Done} active={true} />
          <span className="text-sm font-medium">Select entity</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pl-7">
          {/* Company / Division toggle */}
          <div className="flex rounded-lg border overflow-hidden shrink-0">
            {(['company', 'division'] as EntityType[]).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setEntityType(type)
                  setEntityId('')
                  reset()
                }}
                className={cn(
                  'px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                  entityType === type
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:bg-accent'
                )}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Entity dropdown */}
          <select
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={entityId}
            onChange={(e) => {
              setEntityId(e.target.value)
              reset()
            }}
          >
            <option value="">Select {entityType}…</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Step 2: Upload file ───────────────────────────────────────── */}
      <div className={cn('space-y-3', !step1Done && 'opacity-50 pointer-events-none select-none')}>
        <div className="flex items-center gap-2">
          <StepBadge n={2} done={false} active={step1Done} />
          <span className={cn('text-sm font-medium', !step1Done && 'text-muted-foreground')}>
            Upload file
          </span>
          {!step1Done && (
            <span className="text-xs text-muted-foreground">(select entity first)</span>
          )}
        </div>

        <div className="pl-7">
          <div
            {...getRootProps()}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent/50',
              (!entityId || uploadState.status === 'uploading') && 'cursor-not-allowed'
            )}
          >
            <input {...getInputProps()} />

            {uploadState.status === 'idle' && (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <FileSpreadsheet className="h-10 w-10 opacity-40" />
                <div>
                  <p className="text-sm font-medium">
                    {isDragActive ? 'Drop it here…' : 'Drag & drop an Excel file'}
                  </p>
                  <p className="text-xs mt-0.5">
                    .xlsx or .xls, max 10 MB
                  </p>
                </div>
                <button
                  type="button"
                  className="mt-1 text-xs text-primary underline underline-offset-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  or click to browse
                </button>
              </div>
            )}

            {uploadState.status === 'uploading' && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Processing…</p>
                <Progress value={uploadState.progress} className="w-48" />
              </div>
            )}

            {uploadState.status === 'success' && (
              <div className="flex flex-col items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-8 w-8" />
                <p className="text-sm font-medium">Upload complete</p>
                <div className="flex flex-wrap gap-1 justify-center">
                  {uploadState.result.sheets_found.map((s) => (
                    <Badge key={s} variant="success">{s}</Badge>
                  ))}
                </div>
                {uploadState.result.periods.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Periods: {uploadState.result.periods.join(', ')}
                  </p>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); reset() }}
                  className="mt-1 text-xs text-primary underline underline-offset-2"
                >
                  Upload another
                </button>
              </div>
            )}

            {uploadState.status === 'error' && (
              <div className="flex flex-col items-center gap-2 text-destructive">
                <XCircle className="h-8 w-8" />
                <p className="text-sm font-medium">Upload failed</p>
                <p className="text-xs text-muted-foreground">{uploadState.message}</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); reset() }}
                  className="mt-1 text-xs text-primary underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}
