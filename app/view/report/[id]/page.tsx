// Standalone report viewer — no AppShell or sidebar.
// Lives outside (dashboard) so the root layout is the only wrapper.
// Access: logged-in group member OR valid share token.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient }      from '@/lib/supabase/server'
import { ExternalLink }      from 'lucide-react'
import Link                  from 'next/link'

type Props = {
  params:       { id: string }
  searchParams: { token?: string }
}

// Shown when access is denied — gives no hint about the report existence
function NotAvailable() {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      height:         '100vh',
      fontFamily:     'sans-serif',
      color:          '#6b7280',
      flexDirection:  'column',
      gap:            '12px',
    }}>
      <p style={{ fontSize: '16px', fontWeight: 500 }}>This report is not available.</p>
    </div>
  )
}

export default async function StandaloneReportViewerPage({ params, searchParams }: Props) {
  const admin = createAdminClient()

  // Fetch report metadata via admin client (always — for the header)
  const { data: report } = await admin
    .from('custom_reports')
    .select('id, name, group_id, is_active, is_shareable, share_token')
    .eq('id', params.id)
    .eq('is_active', true)
    .single()

  if (!report) {
    return <NotAvailable />
  }

  // ── Access control ─────────────────────────────────────────────────────────
  // Path 1: Logged-in user who is a member of this report's group
  // Path 2: Token-based access for external sharing

  let fileUrl: string
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    // Check group membership
    const { data: membership } = await admin
      .from('user_groups')
      .select('user_id')
      .eq('user_id', session.user.id)
      .eq('group_id', report.group_id)
      .single()

    if (!membership) {
      return <NotAvailable />
    }

    // Serve via the authenticated API (which also validates group via RLS)
    fileUrl = `/api/reports/custom/${params.id}/file`
  } else {
    // No session — check share token
    const token = searchParams.token

    if (
      !token                         ||
      !report.is_shareable           ||
      !report.share_token            ||
      report.share_token !== token
    ) {
      return <NotAvailable />
    }

    // Serve via public file endpoint (validates token server-side)
    fileUrl = `/api/reports/public/${params.id}/file?token=${encodeURIComponent(token)}`
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  // Fetch group name for header
  const { data: group } = await admin
    .from('groups')
    .select('name')
    .eq('id', report.group_id)
    .single()

  const groupName  = group?.name ?? ''
  const reportName = report.name ?? ''

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100vh',
      overflow:      'hidden',
    }}>
      {/* Branded header — 44px */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '12px',
        padding:      '0 16px',
        flexShrink:   0,
        height:       '44px',
        background:   'var(--palette-surface, #1a1d27)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {/* Wordmark */}
        <span style={{
          fontSize:      '14px',
          fontWeight:    600,
          letterSpacing: '-0.01em',
          lineHeight:    1,
          userSelect:    'none',
          flexShrink:    0,
        }}>
          <span style={{ color: 'var(--palette-primary, #0ea5e9)' }}>nav</span>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>hub</span>
        </span>

        <div style={{ height: '16px', width: '1px', background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />

        {groupName && (
          <span style={{
            fontSize:     '12px',
            color:        'rgba(255,255,255,0.6)',
            maxWidth:     '140px',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            flexShrink:   0,
          }}>
            {groupName}
          </span>
        )}

        <div style={{ height: '16px', width: '1px', background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />

        <span style={{
          fontSize:     '12px',
          color:        'rgba(255,255,255,0.4)',
          flex:         1,
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
          minWidth:     0,
        }}>
          {reportName}
        </span>

        {/* Right actions */}
        <div style={{
          marginLeft: 'auto',
          display:    'flex',
          alignItems: 'center',
          gap:        '12px',
          flexShrink: 0,
        }}>
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            title="Open raw file"
            style={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center' }}
          >
            <ExternalLink style={{ width: '14px', height: '14px' }} />
          </a>
          {session && (
            <Link
              href="/reports/custom"
              style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}
            >
              Back to Library
            </Link>
          )}
        </div>
      </div>

      {/* iframe — fills remaining viewport height */}
      <iframe
        src={fileUrl}
        title={reportName || 'Custom Report'}
        style={{ width: '100%', flex: 1, border: 'none', background: 'white' }}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  )
}
