import { createAdminClient } from '@/lib/supabase/admin'
import { notFound }          from 'next/navigation'
import InviteAcceptClient    from './InviteAcceptClient'

// Server component — fetches token metadata via the admin client. The
// action_link is NEVER passed to the client; only display fields are.
// The accept handshake happens via POST /api/invite/[token]/accept.

export default async function InvitePage({
  params,
}: {
  params: { token: string }
}) {
  const admin = createAdminClient()

  const { data: invite, error } = await admin
    .from('invite_tokens')
    .select('email, group_name, role, full_name, used_at, expires_at')
    .eq('token', params.token)
    .single()

  if (error || !invite) {
    notFound()
  }

  const inv = invite as {
    email:      string
    group_name: string
    role:       string
    full_name:  string | null
    used_at:    string | null
    expires_at: string
  }

  return (
    <InviteAcceptClient
      token={params.token}
      email={inv.email}
      groupName={inv.group_name}
      role={inv.role}
      fullName={inv.full_name}
      isUsed={!!inv.used_at}
      isExpired={new Date(inv.expires_at) < new Date()}
    />
  )
}
