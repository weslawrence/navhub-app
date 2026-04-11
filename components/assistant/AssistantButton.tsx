'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import AssistantPanel from './AssistantPanel'

interface AssistantButtonProps {
  isAdmin?:     boolean
  groupId?:     string
  sidebarMode?: boolean
  onOpen?:      () => void
}

export default function AssistantButton({ isAdmin = false, groupId, sidebarMode = false, onOpen }: AssistantButtonProps) {
  const [open, setOpen] = useState(false)

  function handleOpen() {
    setOpen(true)
    onOpen?.()
  }

  return (
    <>
      {/* Sidebar mode — full-width button styled to match sidebar items */}
      <button
        type="button"
        onClick={handleOpen}
        title="NavHub Assistant"
        aria-label="Open NavHub Assistant"
        className={
          sidebarMode
            ? 'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors'
            : 'fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg flex items-center justify-center bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        }
      >
        <Sparkles
          className={sidebarMode ? 'h-4 w-4 flex-shrink-0' : 'h-5 w-5'}
          style={sidebarMode ? { color: 'var(--palette-primary)' } : undefined}
        />
        {sidebarMode && <span>NavHub Assistant</span>}
      </button>

      {/* Floating panel */}
      {open && (
        <AssistantPanel
          isAdmin={isAdmin}
          groupId={groupId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
