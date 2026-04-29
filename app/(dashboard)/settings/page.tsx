'use client'

import { useState, useEffect } from 'react'
import { useSearchParams }      from 'next/navigation'
import { Settings, SlidersHorizontal, Building2, Upload, Users, Bot, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import DisplayTab      from '@/components/settings/DisplayTab'
import CompaniesTab    from '@/components/settings/CompaniesTab'
import UploadsTab      from '@/components/settings/UploadsTab'
import MembersTab      from '@/components/settings/MembersTab'
import AgentsTab       from '@/components/settings/AgentsTab'
import UsageTab        from '@/components/settings/UsageTab'

// ─── Tabs ────────────────────────────────────────────────────────────────────

type Tab = 'display' | 'companies' | 'agents' | 'uploads' | 'members' | 'usage'

const TABS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'display',      label: 'Display',      Icon: SlidersHorizontal },
  { id: 'companies',    label: 'Companies',    Icon: Building2 },
  { id: 'agents',       label: 'Agents',       Icon: Bot },
  { id: 'uploads',      label: 'Uploads',      Icon: Upload },
  { id: 'usage',        label: 'Usage',        Icon: BarChart2 },
  { id: 'members',      label: 'Members',      Icon: Users },
]

// ─── Settings Page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const paramTab     = searchParams.get('tab') as Tab | null
  // Legacy tab=integrations redirects to /integrations; fall back to 'display'
  const initialTab: Tab = paramTab && ['display','companies','agents','uploads','members','usage'].includes(paramTab) ? paramTab : 'display'

  const [tab,           setTab]           = useState<Tab>(initialTab)
  const [groupId,       setGroupId]       = useState<string | null>(null)
  const [groupName,     setGroupName]     = useState('')
  const [groupSlug,     setGroupSlug]     = useState('')
  const [isAdmin,       setIsAdmin]       = useState(false)
  const [userId,        setUserId]        = useState('')
  const [userEmail,     setUserEmail]     = useState('')
  const [paletteId,     setPaletteId]     = useState('ocean')
  const [fyEndMonth,    setFyEndMonth]    = useState(6)

  // Update tab when URL param changes
  useEffect(() => {
    const t = searchParams.get('tab') as Tab | null
    if (t && TABS.some(tab => tab.id === t)) setTab(t)
  }, [searchParams])

  // Load group + user info
  useEffect(() => {
    fetch('/api/groups/active').then(r => r.json()).then(json => {
      if (json.data) {
        setGroupId(json.data.group.id)
        setGroupName(json.data.group.name)
        setGroupSlug(json.data.group.slug)
        setIsAdmin(json.data.is_admin)
        setUserEmail(json.data.user_email ?? '')
        setPaletteId(json.data.group.palette_id ?? 'ocean')
      }
    }).catch(() => {})

    // Get user ID from session via Supabase client
    import('@/lib/supabase/client').then(({ createClient }) => {
      const sb = createClient()
      sb.auth.getSession().then(({ data }) => {
        if (data.session?.user.id) setUserId(data.session.user.id)
      })
    }).catch(() => {})

    // Load FY end month from settings
    fetch('/api/settings').then(r => r.json()).then(json => {
      if (json.data?.fy_end_month) setFyEndMonth(json.data.fy_end_month)
    }).catch(() => {})
  }, [])

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Settings className="h-6 w-6" /> Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure display preferences, manage companies, integrations and team members
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors -mb-px border-b-2 whitespace-nowrap',
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <t.Icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'display' && (
          <DisplayTab
            groupId={groupId}
            groupName={groupName}
            groupSlug={groupSlug}
            isAdmin={isAdmin}
            selectedPaletteId={paletteId}
            onGroupNameChange={setGroupName}
            onPaletteChange={setPaletteId}
          />
        )}
        {tab === 'companies' && (
          <CompaniesTab />
        )}
        {tab === 'agents' && (
          <AgentsTab isAdmin={isAdmin} />
        )}
        {tab === 'uploads' && (
          <UploadsTab isAdmin={isAdmin} fyEndMonth={fyEndMonth} />
        )}
        {tab === 'usage' && (
          <UsageTab />
        )}
        {tab === 'members' && (
          <MembersTab
            groupId={groupId}
            isAdmin={isAdmin}
            userId={userId}
            userEmail={userEmail}
          />
        )}
      </div>
    </div>
  )
}
