'use client'

import { useRef, useState } from 'react'
import { Upload, Loader2, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = '.pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.pptx,.ppt,.html'

export interface UploadDropzoneProps {
  onUpload:    (files: File[]) => void
  uploading?:  boolean
  progress?:   Record<string, number>   // filename -> 0-100
  errors?:     Record<string, string>   // filename -> error message
  compact?:    boolean
}

export default function UploadDropzone({
  onUpload,
  uploading = false,
  progress  = {},
  errors    = {},
  compact   = false,
}: UploadDropzoneProps) {
  const inputRef  = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(files: FileList | File[] | null) {
    if (!files) return
    const arr = Array.from(files)
    if (arr.length > 0) onUpload(arr)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files)
    // Reset input so same file can be re-uploaded if needed
    e.target.value = ''
  }

  const progressEntries = Object.entries(progress)
  const errorEntries    = Object.entries(errors)

  if (compact) {
    return (
      <div className="space-y-2">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex items-center gap-3 rounded-lg border border-dashed px-4 py-2.5 cursor-pointer transition-colors text-sm',
            dragging
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-input text-muted-foreground hover:border-primary/50 hover:bg-muted/50',
            uploading && 'pointer-events-none opacity-60'
          )}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          ) : (
            <Upload className="h-4 w-4 shrink-0" />
          )}
          <span>{uploading ? 'Uploading…' : 'Drop files here or click to upload'}</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            onChange={handleChange}
            className="hidden"
          />
        </div>
        {progressEntries.length > 0 && (
          <div className="space-y-1">
            {progressEntries.map(([name, pct]) => (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span className="truncate max-w-[200px] text-muted-foreground">{name}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
              </div>
            ))}
          </div>
        )}
        {errorEntries.length > 0 && (
          <div className="space-y-1">
            {errorEntries.map(([name, msg]) => (
              <div key={name} className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span><span className="font-medium">{name}:</span> {msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Full empty-state mode
  return (
    <div className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-12 cursor-pointer transition-colors text-center',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-input hover:border-primary/50 hover:bg-muted/20',
          uploading && 'pointer-events-none opacity-60'
        )}
      >
        {uploading ? (
          <Loader2 className="h-10 w-10 text-muted-foreground/50 animate-spin mb-3" />
        ) : (
          <Upload className="h-10 w-10 text-muted-foreground/40 mb-3" />
        )}
        <p className="text-sm font-medium text-foreground">
          {uploading ? 'Uploading…' : 'Drop files here or click to upload'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          PDF, DOCX, TXT, MD, PNG, JPG, XLSX, CSV, PPTX, HTML
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES}
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {progressEntries.length > 0 && (
        <div className="space-y-2">
          {progressEntries.map(([name, pct]) => (
            <div key={name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate max-w-[300px] text-muted-foreground">{name}</span>
                <span className="text-muted-foreground tabular-nums">{pct}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {errorEntries.length > 0 && (
        <div className="space-y-1.5">
          {errorEntries.map(([name, msg]) => (
            <div key={name} className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <X className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-medium text-destructive">{name}:</span>
                <span className="text-muted-foreground ml-1">{msg}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
