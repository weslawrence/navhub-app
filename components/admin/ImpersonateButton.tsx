'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Loader2 } from 'lucide-react'

export default function ImpersonateButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const router   = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleImpersonate() {
    setLoading(true)
    const res  = await fetch('/api/admin/impersonate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ group_id: groupId }),
    })
    if (res.ok) {
      router.push('/dashboard')
      router.refresh()
    } else {
      const json = await res.json() as { error?: string }
      alert(json.error ?? 'Failed to impersonate')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleImpersonate}
      disabled={loading}
      title={`Impersonate ${groupName}`}
      className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 border border-amber-700/50 hover:border-amber-500/70 px-2.5 py-1 rounded transition-colors disabled:opacity-60"
    >
      {loading
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <Eye className="h-3 w-3" />}
      Impersonate
    </button>
  )
}
