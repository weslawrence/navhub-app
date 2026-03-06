'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface CompanyFormValues {
  name:        string
  description: string
  industry:    string
}

interface CompanyFormProps {
  defaultValues?: Partial<CompanyFormValues>
  onSubmit:       (values: CompanyFormValues) => Promise<void>
  isLoading:      boolean
  submitLabel?:   string
}

export function CompanyForm({
  defaultValues,
  onSubmit,
  isLoading,
  submitLabel = 'Save',
}: CompanyFormProps) {
  const [name,        setName]        = useState(defaultValues?.name        ?? '')
  const [description, setDescription] = useState(defaultValues?.description ?? '')
  const [industry,    setIndustry]    = useState(defaultValues?.industry    ?? '')
  const [error,       setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Company name is required.')
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
        <Label htmlFor="company-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="company-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Acme Corp"
          disabled={isLoading}
          required
        />
      </div>

      {/* Industry */}
      <div className="space-y-1.5">
        <Label htmlFor="company-industry">Industry</Label>
        <Input
          id="company-industry"
          value={industry}
          onChange={e => setIndustry(e.target.value)}
          placeholder="e.g. Retail, SaaS, Construction"
          disabled={isLoading}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="company-description">Description</Label>
        <textarea
          id="company-description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Optional description of this company"
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
