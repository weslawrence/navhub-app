// Standalone report viewer — no AppShell or sidebar.
// Lives outside (dashboard) so the root layout is the only wrapper.
// Protected by middleware (user must be logged in), but no heavy group loading.

import { createAdminClient } from '@/lib/supabase/admin'
import { ExternalLink }       from 'lucide-react'
import Link                   from 'next/link'

type Props = { params: { id: string } }

export default async function StandaloneReportViewerPage({ params }: Props) {
  const admin = createAdminClient()

  // Fetch report metadata
  const { data: report } = await admin
    .from('custom_reports')
    .select('id, name, group_id, is_active')
    .eq('id', params.id)
    .eq('is_active', true)
    .single()

  if (!report) {
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
        <p style={{ fontSize: '16px', fontWeight: 500 }}>Report not found.</p>
        <a href="/reports/custom" style={{ fontSize: '14px', color: '#0ea5e9' }}>
          Back to Reports Library
        </a>
      </div>
    )
  }

  // Fetch group name
  const { data: group } = await admin
    .from('groups')
    .select('name')
    .eq('id', report.group_id)
    .single()

  const groupName  = group?.name  ?? ''
  const reportName = report.name  ?? ''
  const fileUrl    = `/api/reports/custom/${params.id}/file`

  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      height:         '100vh',
      overflow:       'hidden',
    }}>
      {/* Branded header — 44px */}
      <div style={{
        display:         'flex',
        alignItems:      'center',
        gap:             '12px',
        padding:         '0 16px',
        flexShrink:      0,
        height:          '44px',
        background:      'var(--palette-surface, #1a1d27)',
        borderBottom:    '1px solid rgba(255,255,255,0.08)',
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

        {/* Divider */}
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

        {/* Divider */}
        <div style={{ height: '16px', width: '1px', background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />

        {/* Report name */}
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
          marginLeft:  'auto',
          display:     'flex',
          alignItems:  'center',
          gap:         '12px',
          flexShrink:  0,
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
          <Link
            href="/reports/custom"
            style={{
              fontSize:   '12px',
              color:      'rgba(255,255,255,0.4)',
              textDecoration: 'none',
            }}
          >
            Back to Library
          </Link>
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
