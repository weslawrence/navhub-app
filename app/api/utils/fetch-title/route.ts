import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/utils/fetch-title
 * Fetches the <title> tag of an arbitrary URL server-side (avoids CORS).
 * Used by the BulkLinkAdder UI to label pasted reference links.
 *
 * Body: { url: string }
 * Returns: { title: string | null }
 *
 * Authenticated only — we don't want to operate as a free open proxy.
 */
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ title: null, error: 'Unauthorized' }, { status: 401 })

  let url: string
  try {
    const body = await request.json() as { url?: string }
    url = (body.url ?? '').trim()
  } catch {
    return NextResponse.json({ title: null, error: 'Invalid JSON' }, { status: 400 })
  }

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ title: null, error: 'Invalid URL' }, { status: 400 })
  }

  // Block obviously private/loopback addresses to mitigate SSRF
  const lower = url.toLowerCase()
  if (
    lower.includes('localhost')      ||
    lower.includes('127.0.0.1')      ||
    lower.includes('://10.')         ||
    lower.includes('://192.168.')    ||
    lower.includes('://169.254.')    ||
    lower.includes('://0.')
  ) {
    return NextResponse.json({ title: null, error: 'Private addresses not allowed' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NavHub/1.0 (title-fetcher)' },
      redirect: 'follow',
      signal:   AbortSignal.timeout(5000),
    })

    if (!res.ok) return NextResponse.json({ title: null })

    // Pull only the first ~64 KB — title is in <head>, no need to download whole pages.
    const reader  = res.body?.getReader()
    if (!reader)  return NextResponse.json({ title: null })
    const decoder = new TextDecoder()
    let html = ''
    let total = 0
    while (total < 64 * 1024) {
      const { done, value } = await reader.read()
      if (done) break
      total += value?.length ?? 0
      html  += decoder.decode(value, { stream: true })
      // Bail as soon as we have the title tag
      if (/<\/title>/i.test(html)) break
    }
    try { reader.cancel() } catch { /* ignore */ }

    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = match?.[1]?.trim().replace(/\s+/g, ' ') ?? null
    return NextResponse.json({ title: title?.slice(0, 200) ?? null })
  } catch {
    return NextResponse.json({ title: null })
  }
}
