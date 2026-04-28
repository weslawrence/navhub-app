import { NextResponse }     from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractDocumentText } from '@/lib/document-extract'

/**
 * POST /api/admin/backfill-extractions
 * Finds all documents with a file_path but empty/null content_markdown and
 * runs extraction on each. Super-admin only.
 *
 * Body (optional): { document_ids?: string[] } — restrict to specific docs.
 *
 * Returns: { processed, succeeded, failed, errors }
 */

export const runtime     = 'nodejs'
export const maxDuration = 300

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Super admin only
  const { data: roleRow } = await supabase
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('role', 'super_admin')
    .limit(1)
  if (!roleRow || roleRow.length === 0) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 })
  }

  let body: { document_ids?: string[] } = {}
  try { body = await req.json() } catch { /* allow empty body */ }
  const restrictIds = Array.isArray(body.document_ids) ? body.document_ids : null

  const admin = createAdminClient()

  let query = admin
    .from('documents')
    .select('id, file_path, file_name, file_type, content_markdown')
    .not('file_path', 'is', null)
    .or('content_markdown.is.null,content_markdown.eq.')

  if (restrictIds && restrictIds.length > 0) query = query.in('id', restrictIds)

  const { data: docs, error: listErr } = await query
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  let processed = 0
  let succeeded = 0
  let failed    = 0
  const errors: string[] = []

  for (const doc of (docs ?? []) as Array<{ id: string; file_path: string; file_name: string; file_type: string }>) {
    processed += 1
    try {
      const { data: fileData, error: dlErr } = await admin.storage
        .from('documents')
        .download(doc.file_path)
      if (dlErr || !fileData) {
        failed += 1
        errors.push(`${doc.file_name}: download failed (${dlErr?.message ?? 'no data'})`)
        continue
      }

      const buffer = Buffer.from(await fileData.arrayBuffer())
      const text   = await extractDocumentText(doc.file_name, doc.file_type, buffer)
      if (!text.trim()) {
        failed += 1
        errors.push(`${doc.file_name}: extractor returned empty content`)
        continue
      }

      const { error: upErr } = await admin
        .from('documents')
        .update({ content_markdown: text })
        .eq('id', doc.id)
      if (upErr) {
        failed += 1
        errors.push(`${doc.file_name}: update failed (${upErr.message})`)
        continue
      }

      succeeded += 1
    } catch (err) {
      failed += 1
      errors.push(`${doc.file_name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({
    processed,
    succeeded,
    failed,
    total:  docs?.length ?? 0,
    errors: errors.slice(0, 50),
  })
}
