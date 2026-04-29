'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export interface BulkAddedLink {
  url:   string
  label: string
}

interface BulkLinkAdderProps {
  /** Called with the list of new links after the user clicks Add. */
  onAdd:    (links: BulkAddedLink[]) => void
  /** Optional dark-theme toggle for the admin shell. */
  dark?:    boolean
}

/**
 * Reusable "paste-many-URLs-and-fetch-titles" picker. Used by:
 *   - Agent _form Knowledge tab
 *   - AgentsTab Universal Knowledge panel
 *   - Admin /admin/assistant Reference Links section (when added)
 *
 * Auto-fetches each URL's <title> via /api/utils/fetch-title (server-side
 * to avoid CORS) and falls back to the URL itself when fetch fails.
 */
export default function BulkLinkAdder({ onAdd, dark = false }: BulkLinkAdderProps) {
  const [show,    setShow]    = useState(false)
  const [text,    setText]    = useState('')
  const [loading, setLoading] = useState(false)

  const candidateCount = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^https?:\/\//i.test(l))
    .length

  async function handleAdd() {
    const urls = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => /^https?:\/\//i.test(l))
    if (urls.length === 0) return

    setLoading(true)
    try {
      const settled = await Promise.allSettled(
        urls.map(async url => {
          try {
            const res = await fetch('/api/utils/fetch-title', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ url }),
            })
            const json = await res.json() as { title?: string | null }
            return { url, label: (json.title?.trim() || url) }
          } catch {
            return { url, label: url }
          }
        }),
      )
      const links = settled
        .filter((r): r is PromiseFulfilledResult<BulkAddedLink> => r.status === 'fulfilled')
        .map(r => r.value)
      onAdd(links)
      setText('')
      setShow(false)
    } finally {
      setLoading(false)
    }
  }

  if (!show) {
    return (
      <button
        type="button"
        onClick={() => setShow(true)}
        className={
          'text-xs hover:underline ' +
          (dark ? 'text-zinc-300 hover:text-white' : 'text-primary')
        }
      >
        + Bulk add links
      </button>
    )
  }

  const containerClass = dark
    ? 'space-y-2 rounded-md border border-zinc-700 bg-zinc-900 p-3'
    : 'space-y-2 rounded-md border bg-muted/30 p-3'
  const taClass = dark
    ? 'w-full text-xs rounded p-2 bg-zinc-950 border border-zinc-700 text-zinc-100 resize-y font-mono'
    : 'w-full text-xs rounded p-2 bg-background border border-input resize-y font-mono'
  const primaryBtn = dark
    ? 'text-xs bg-zinc-100 text-zinc-900 px-3 py-1.5 rounded hover:bg-white disabled:opacity-50'
    : 'text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-50'
  const cancelBtn = dark
    ? 'text-xs text-zinc-400 hover:text-zinc-100'
    : 'text-xs text-muted-foreground hover:text-foreground'
  const labelClass = dark ? 'text-xs text-zinc-300 font-medium' : 'text-xs font-medium'

  return (
    <div className={containerClass}>
      <p className={labelClass}>Paste URLs — one per line. Titles will be fetched automatically.</p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={4}
        placeholder={'https://example.com/article\nhttps://docs.site.com/guide'}
        className={taClass}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={loading || candidateCount === 0}
          className={primaryBtn + ' inline-flex items-center gap-1.5'}
        >
          {loading
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Fetching titles…</>
            : `Add ${candidateCount} link${candidateCount === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          onClick={() => { setShow(false); setText('') }}
          disabled={loading}
          className={cancelBtn}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
