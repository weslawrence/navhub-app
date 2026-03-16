'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import AssistantPanel from './AssistantPanel'

interface AssistantButtonProps {
  isAdmin?: boolean
}

export default function AssistantButton({ isAdmin = false }: AssistantButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="NavHub Assistant"
        aria-label="Open NavHub Assistant"
        className={cn(
          'fixed bottom-6 right-6 z-40',
          'h-12 w-12 rounded-full shadow-lg',
          'flex items-center justify-center',
          'bg-primary text-primary-foreground',
          'hover:opacity-90 active:scale-95 transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <Sparkles className="h-5 w-5" />
      </button>

      {/* Slide-in panel */}
      {open && (
        <AssistantPanel
          isAdmin={isAdmin}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
