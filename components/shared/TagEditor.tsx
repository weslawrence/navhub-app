'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TagEditorProps {
  tags:       string[]
  onSave:     (tags: string[]) => Promise<void>
  allTags?:   string[]
  className?: string
  compact?:   boolean
}

export default function TagEditor({ tags, onSave, allTags, className, compact }: TagEditorProps) {
  const [localTags, setLocalTags] = useState(tags)
  const [input, setInput]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const dirty = useRef(false)

  useEffect(() => { setLocalTags(tags) }, [tags])

  function updateSuggestions(value: string) {
    if (!value.trim() || !allTags) { setSuggestions([]); return }
    const q = value.toLowerCase()
    setSuggestions(
      allTags
        .filter(t => t.toLowerCase().includes(q) && !localTags.includes(t))
        .slice(0, 5)
    )
  }

  function addTag(tag: string) {
    const clean = tag.toLowerCase().trim().slice(0, 40)
    if (!clean || localTags.includes(clean)) return
    const next = [...localTags, clean]
    setLocalTags(next)
    setInput('')
    setSuggestions([])
    dirty.current = true
  }

  function removeTag(tag: string) {
    const next = localTags.filter(t => t !== tag)
    setLocalTags(next)
    dirty.current = true
    // Auto-save on remove
    void save(next)
  }

  async function save(tagsToSave?: string[]) {
    const t = tagsToSave ?? localTags
    if (!dirty.current && !tagsToSave) return
    setSaving(true)
    await onSave(t)
    setSaving(false)
    dirty.current = false
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (input.trim()) {
        addTag(input)
      }
    }
    if (e.key === 'Backspace' && !input && localTags.length > 0) {
      removeTag(localTags[localTags.length - 1])
    }
  }

  function handleBlur() {
    if (input.trim()) addTag(input)
    setTimeout(() => {
      setSuggestions([])
      if (dirty.current) void save()
    }, 200)
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {/* Existing tags */}
      <div className="flex flex-wrap gap-1">
        {localTags.map(tag => (
          <span key={tag} className={cn(
            'inline-flex items-center gap-0.5 rounded-full bg-secondary text-secondary-foreground font-medium',
            compact ? 'text-[10px] px-1.5 py-0 h-5' : 'text-xs px-2 py-0.5'
          )}>
            {tag}
            <button onClick={() => removeTag(tag)} className="hover:text-destructive transition-colors">
              <X className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            </button>
          </span>
        ))}
        {saving && <span className="text-[10px] text-muted-foreground animate-pulse">Saving…</span>}
      </div>

      {/* Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); updateSuggestions(e.target.value) }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="Add tag…"
          className={cn(
            'w-full rounded-md border border-input bg-transparent text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            compact ? 'h-6 px-2 text-[11px]' : 'h-7 px-2 text-xs'
          )}
        />
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 z-30 mt-0.5 bg-background border rounded-md shadow-lg py-0.5 w-full max-h-32 overflow-y-auto">
            {suggestions.map(s => (
              <button
                key={s}
                onMouseDown={e => { e.preventDefault(); addTag(s) }}
                className="w-full text-left px-2 py-1 text-xs hover:bg-muted"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
