import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Auth guard — Keystatic is restricted to super_admin users only.
// The GitHub PAT cookie is injected by middleware before reaching this layout.
export default async function KeystaticLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  // Verify super_admin role
  const { data: memberships } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('role', 'super_admin')

  if (!memberships || memberships.length === 0) redirect('/dashboard')

  return <>{children}</>
}
