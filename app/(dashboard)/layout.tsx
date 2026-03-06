import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AppShell from '@/components/layout/AppShell'
import type { Group, UserGroup } from '@/lib/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  // Auth check
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  // Load all groups the user belongs to, with group details
  const { data: userGroups } = await supabase
    .from('user_groups')
    .select('*, group:groups(*)')
    .eq('user_id', session.user.id)
    .order('is_default', { ascending: false })

  if (!userGroups || userGroups.length === 0) {
    // No groups assigned — redirect to login with message
    redirect('/login')
  }

  // Determine active group from cookie
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const activeUserGroup =
    userGroups.find((ug) => ug.group_id === activeGroupId) ??
    userGroups.find((ug) => ug.is_default) ??
    userGroups[0]

  const activeGroup = activeUserGroup.group as Group

  // Cast userGroups to typed array (group is always present due to join)
  const typedGroups = userGroups as (UserGroup & { group: Group })[]

  return (
    <>
      {/*
        Inject group primary colour server-side to prevent colour flash on
        hydration. This runs before any client JS executes.
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: `:root { --group-primary: ${activeGroup.primary_color}; }`,
        }}
      />
      <AppShell
        user={{ id: session.user.id, email: session.user.email! }}
        groups={typedGroups}
        activeGroup={activeGroup}
      >
        {children}
      </AppShell>
    </>
  )
}
