'use client'

import { useState } from 'react'
import { HelpCircle, Headphones, Lightbulb } from 'lucide-react'
import SupportModal          from './SupportModal'
import FeatureSuggestionModal from './FeatureSuggestionModal'

interface HelpMenuProps {
  userEmail: string
}

export default function HelpMenu({ userEmail }: HelpMenuProps) {
  const [open,         setOpen]         = useState(false)
  const [showSupport,  setShowSupport]  = useState(false)
  const [showFeature,  setShowFeature]  = useState(false)

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors text-sm"
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          <span>Help</span>
        </button>

        {open && (
          <>
            {/* Backdrop — click to close */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />

            {/* Popover */}
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-zinc-800 border border-white/10 rounded-lg shadow-xl overflow-hidden z-20">
              <button
                onClick={() => { setOpen(false); setShowSupport(true) }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left"
              >
                <Headphones className="h-4 w-4 shrink-0 text-blue-400" />
                Get Support
              </button>
              <div className="border-t border-white/10" />
              <button
                onClick={() => { setOpen(false); setShowFeature(true) }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left"
              >
                <Lightbulb className="h-4 w-4 shrink-0 text-yellow-400" />
                Suggest a Feature
              </button>
            </div>
          </>
        )}
      </div>

      {showSupport && (
        <SupportModal userEmail={userEmail} onClose={() => setShowSupport(false)} />
      )}
      {showFeature && (
        <FeatureSuggestionModal userEmail={userEmail} onClose={() => setShowFeature(false)} />
      )}
    </>
  )
}
