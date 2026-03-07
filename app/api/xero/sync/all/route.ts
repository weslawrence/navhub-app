import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── POST /api/xero/sync/all ─────────────────────────────────────────────────
// Stub route — queues a sync intent and returns immediately.
// In a future phase this will trigger the actual Xero sync for all connections
// in the active group (or proxy to the cron route).
export async function POST() {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Phase 2b stub — real sync implementation in Phase 3
  return NextResponse.json({ data: { queued: true } })
}
