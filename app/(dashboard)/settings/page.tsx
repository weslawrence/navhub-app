import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Settings } from 'lucide-react'

export default async function SettingsPage() {
  const supabase    = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: group } = activeGroupId
    ? await supabase.from('groups').select('*').eq('id', activeGroupId).single()
    : { data: null }

  const { data: { session } } = await supabase.auth.getSession()

  const { data: userGroup } = activeGroupId && session
    ? await supabase
        .from('user_groups')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('group_id', activeGroupId)
        .single()
    : { data: null }

  const isAdmin = userGroup?.role === 'super_admin' || userGroup?.role === 'group_admin'

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6" /> Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Group and account configuration
        </p>
      </div>

      {/* Group info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Group Details</CardTitle>
          <CardDescription>
            Information about the active group
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {group ? (
            <>
              <Row label="Name"  value={group.name} />
              <Row label="Slug"  value={group.slug} />
              <Row label="Colour" value={
                <span className="flex items-center gap-2">
                  <span
                    className="h-4 w-4 rounded-sm ring-1 ring-border"
                    style={{ backgroundColor: group.primary_color }}
                  />
                  {group.primary_color}
                </span>
              } />
              <Row label="Your role" value={userGroup?.role ?? '—'} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No group selected.</p>
          )}
        </CardContent>
      </Card>

      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Your login details</CardDescription>
        </CardHeader>
        <CardContent>
          <Row label="Email" value={session?.user.email ?? '—'} />
        </CardContent>
      </Card>

      {!isAdmin && (
        <p className="text-sm text-muted-foreground">
          Group settings can only be changed by group administrators.
        </p>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}
