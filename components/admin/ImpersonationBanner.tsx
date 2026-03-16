'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'

export default function ImpersonationBanner({ groupName }: { groupName: string }) {
  const router  = useRouter()
  const [exiting, setExiting] = useState(false)

  async function handleExit() {
    setExiting(true)
    await fetch('/api/admin/impersonate', { method: 'DELETE' })
    router.push('/admin/groups')
    router.refresh()
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 bg-amber-500 text-amber-950 px-4 h-9 text-sm font-medium shadow-md">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Viewing as <strong>{groupName}</strong> — superadmin impersonation mode
        </span>
      </div>
      <button
        onClick={handleExit}
        disabled={exiting}
        className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-950/20 hover:bg-amber-950/30 transition-colors disabled:opacity-60 text-xs font-semibold"
      >
        <X className="h-3.5 w-3.5" />
        {exiting ? 'Exiting…' : 'Exit'}
      </button>
    </div>
  )
}
