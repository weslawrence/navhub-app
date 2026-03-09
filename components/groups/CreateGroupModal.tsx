'use client'

import { useState } from 'react'
import { useRouter }  from 'next/navigation'
import { X, Check, Loader2, Plus } from 'lucide-react'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { PALETTES, getPalette } from '@/lib/themes'
import { cn } from '@/lib/utils'

interface CreateGroupModalProps {
  onClose: () => void
}

export default function CreateGroupModal({ onClose }: CreateGroupModalProps) {
  const router = useRouter()

  const [name,       setName]       = useState('')
  const [paletteId,  setPaletteId]  = useState('ocean')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState(false)

  async function handleCreate() {
    const trimmed = name.trim()
    if (trimmed.length < 2) { setError('Name must be at least 2 characters'); return }
    setSaving(true)
    setError(null)
    try {
      const res  = await fetch('/api/groups', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: trimmed }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create group')

      // If palette differs from default, save it
      if (paletteId !== 'ocean' && json.data?.id) {
        await fetch(`/api/groups/${json.data.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ palette_id: paletteId }),
        })
      }

      setSuccess(true)
      setTimeout(() => {
        onClose()
        router.push('/dashboard')
        router.refresh()
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group')
      setSaving(false)
    }
  }

  const activePalette = getPalette(paletteId)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-md rounded-xl border bg-background shadow-xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b">
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Create New Group</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-5">
            {/* Group name */}
            <div className="space-y-1.5">
              <Label htmlFor="new-group-name" className="text-sm font-medium text-foreground">
                Group Name
              </Label>
              <Input
                id="new-group-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Acme Holdings"
                onKeyDown={e => { if (e.key === 'Enter') void handleCreate() }}
                disabled={saving || success}
              />
            </div>

            {/* Palette */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-foreground">Colour Palette</Label>
              <div className="grid grid-cols-4 gap-2">
                {PALETTES.map(palette => (
                  <button
                    key={palette.id}
                    type="button"
                    onClick={() => setPaletteId(palette.id)}
                    className={cn(
                      'p-2 rounded-lg border-2 text-center transition-all focus:outline-none',
                      paletteId === palette.id
                        ? 'border-primary ring-1 ring-primary/30'
                        : 'border-border hover:border-muted-foreground/50'
                    )}
                    disabled={saving || success}
                  >
                    <div
                      className="h-5 w-full rounded-sm mx-auto mb-1"
                      style={{ backgroundColor: palette.primary }}
                    />
                    <p className="text-xs text-muted-foreground">{palette.name}</p>
                    {paletteId === palette.id && (
                      <Check className="h-3 w-3 text-primary mx-auto mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Preview: <span className="font-medium text-foreground">{activePalette.name}</span>
              </p>
            </div>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            {success && (
              <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> Group created! Switching now…
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 p-5 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || success || name.trim().length < 2}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: 'var(--palette-primary)' }}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? 'Creating…' : 'Create Group'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
