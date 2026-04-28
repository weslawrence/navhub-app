import { NextResponse }     from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/assistant/persona
 * Lightweight endpoint that returns the resolved (merged platform + group)
 * persona name for the floating Assistant chrome. Used by AssistantButton
 * and AssistantPanel to label themselves correctly per group.
 *
 * Returns: { persona_name: string }
 */
export const runtime = 'nodejs'

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ persona_name: 'NavHub Assistant' })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const admin = createAdminClient()

  try {
    const [platformRes, groupRes] = await Promise.all([
      admin
        .from('assistant_config')
        .select('persona_name')
        .is('group_id', null)
        .maybeSingle(),
      activeGroupId
        ? admin
            .from('assistant_config')
            .select('persona_name')
            .eq('group_id', activeGroupId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const groupName    = (groupRes.data    as { persona_name?: string | null } | null)?.persona_name
    const platformName = (platformRes.data as { persona_name?: string | null } | null)?.persona_name
    const resolved     = (groupName?.trim() || platformName?.trim() || 'NavHub Assistant')

    return NextResponse.json({ persona_name: resolved })
  } catch {
    return NextResponse.json({ persona_name: 'NavHub Assistant' })
  }
}
