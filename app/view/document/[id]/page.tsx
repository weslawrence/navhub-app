import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient }      from '@/lib/supabase/server'
import ReactMarkdown         from 'react-markdown'
import remarkGfm             from 'remark-gfm'
import Link                  from 'next/link'
import type { Document }     from '@/lib/types'

// ─── Not Available ──────────────────────────────────────────────────────────

function NotAvailable() {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f1117' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <p style={{ fontSize: '1.125rem', color: '#9ca3af' }}>This document is not available.</p>
        </div>
      </body>
    </html>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ViewDocumentPage({
  params,
  searchParams,
}: {
  params:       { id: string }
  searchParams: { token?: string }
}) {
  const admin    = createAdminClient()
  const token    = searchParams.token
  let   document: Document | null = null
  let   groupName = ''
  let   isAuthenticated = false

  // ── Path 1: Session user ────────────────────────────────────────────────

  const supabase    = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    // Verify group membership via server client (RLS)
    const { data: doc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .single()

    if (doc) {
      document        = doc as Document
      isAuthenticated = true

      // Fetch group name
      const { data: grp } = await admin.from('groups').select('name').eq('id', doc.group_id).single()
      groupName = (grp as { name: string } | null)?.name ?? ''
    }
  }

  // ── Path 2: Token user ──────────────────────────────────────────────────

  if (!document && token) {
    const { data: doc } = await admin
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .eq('is_active', true)  // documents have no is_active — use is_shareable
      .eq('is_shareable', true)
      .single()

    if (doc && (doc as Document).share_token === token) {
      document = doc as Document
      const { data: grp } = await admin.from('groups').select('name').eq('id', doc.group_id).single()
      groupName = (grp as { name: string } | null)?.name ?? ''
    }
  }

  // ── Token path: re-try without is_active filter ─────────────────────────

  if (!document && !session && token) {
    const { data: doc } = await admin
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .eq('is_shareable', true)
      .single()

    if (doc && (doc as Document).share_token === token) {
      document = doc as Document
      const { data: grp } = await admin.from('groups').select('name').eq('id', doc.group_id).single()
      groupName = (grp as { name: string } | null)?.name ?? ''
    }
  }

  if (!document) return <NotAvailable />

  const headerBg     = 'var(--palette-surface, #1a1d27)'
  const headerBorder = '1px solid rgba(255,255,255,0.08)'

  return (
    <html lang="en">
      <head>
        <title>{document.title} — NavHub</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          body { margin: 0; font-family: system-ui, sans-serif; }
          .prose { max-width: 72ch; margin: 0 auto; padding: 2rem; line-height: 1.7; }
          .prose h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 1rem; }
          .prose h2 { font-size: 1.375rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }
          .prose h3 { font-size: 1.125rem; font-weight: 600; margin: 1.25rem 0 0.5rem; }
          .prose p  { margin: 0.75rem 0; }
          .prose ul, .prose ol { padding-left: 1.5rem; margin: 0.75rem 0; }
          .prose li { margin: 0.25rem 0; }
          .prose table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
          .prose th, .prose td { padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; text-align: left; }
          .prose th { background: #f9fafb; font-weight: 600; }
          .prose code { background: #f3f4f6; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875em; }
          .prose pre  { background: #1f2937; color: #f9fafb; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
          .prose pre code { background: none; padding: 0; }
          .prose blockquote { border-left: 4px solid #e5e7eb; padding-left: 1rem; color: #6b7280; margin: 1rem 0; }
          @media (prefers-color-scheme: dark) {
            body { background: #0f1117; color: #e5e7eb; }
            .prose th { background: #1f2937; }
            .prose th, .prose td { border-color: #374151; }
            .prose code { background: #1f2937; }
          }
        `}</style>
      </head>
      <body>
        {/* Branded header */}
        <header style={{
          height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 1.25rem', background: headerBg, borderBottom: headerBorder,
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>
              <span style={{ color: 'var(--palette-primary, #0ea5e9)' }}>Nav</span>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Hub</span>
            </span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{groupName}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
            <span style={{ color: 'rgba(255,255,255,0.8)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {document.title}
            </span>
          </div>
          {isAuthenticated && (
            <Link
              href="/documents"
              style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', textDecoration: 'none' }}
            >
              ← Back to Documents
            </Link>
          )}
        </header>

        {/* Content */}
        <main>
          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {document.content_markdown}
            </ReactMarkdown>
          </div>
        </main>
      </body>
    </html>
  )
}
