'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface DivisionFormValues {
  name:        string
  description: string
  industry:    string
}

interface DivisionFormProps {
  defaultValues?: Partial<DivisionFormValues>
  onSubmit:       (values: DivisionFormValues) => Promise<void>
  isLoading:      boolean
  submitLabel?:   string
}

export function DivisionForm({
  defaultValues,
  onSubmit,
  isLoading,
  submitLabel = 'Save',
}: DivisionFormProps) {
  const [name,        setName]        = useState(defaultValues?.name        ?? '')
  const [description, setDescription] = useState(defaultValues?.description ?? '')
  const [industry,    setIndustry]    = useState(defaultValues?.industry    ?? '')
  const [error,       setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Division name is required.')
      return
    }
    try {
      await onSubmit({
        name:        name.trim(),
        description: description.trim(),
        industry:    industry.trim(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="division-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="division-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Operations, Finance, Digital"
          disabled={isLoading}
          required
        />
      </div>

      {/* Industry */}
      <div className="space-y-1.5">
        <Label htmlFor="division-industry">Industry</Label>
        <Input
          id="division-industry"
          value={industry}
          onChange={e => setIndustry(e.target.value)}
          placeholder="e.g. Retail, SaaS, Construction"
          disabled={isLoading}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="division-description">Description</Label>
        <textarea
          id="division-description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Optional description of this division"
          disabled={isLoading}
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
