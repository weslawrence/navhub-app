import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET /api/reports/public/[id]/file?token=... ─────────────────────────────
// Serves a shared report file using a token instead of session auth.
// No login required. Returns 403 (without detail) if token is invalid.

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Validate token — must match, be shareable, and be active
  const { data: report } = await admin
    .from('custom_reports')
    .select('file_path, share_token, is_shareable, is_active')
    .eq('id', params.id)
    .eq('is_active', true)
    .eq('is_shareable', true)
    .single()

  // Constant-time string comparison is ideal, but report not found and wrong
  // token both result in the same 403 — avoids leaking report existence.
  if (!report || !report.share_token || report.share_token !== token) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Serve the file
  const { data, error } = await admin.storage
    .from('report-files')
    .download(report.file_path)

  if (error || !data) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const text = await data.text()

  return new NextResponse(text, {
    headers: {
      'Content-Type':        'text/html; charset=utf-8',
      'Content-Disposition': 'inline',
      // Prevent the browser from caching the response with the token visible
      'Cache-Control':       'private, no-store',
    },
  })
}
