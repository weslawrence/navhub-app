import { NextResponse } from 'next/server'
import { cookies }       from 'next/headers'
import { createClient }  from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ToolParameter } from '@/lib/types'

// POST — test a webhook with sample values and return the response.
// Body: { sample_input?: Record<string, unknown> }
// If sample_input is not provided, auto-generates one based on parameter types.

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const admin = createAdminClient()
  const { data: tool } = await admin
    .from('custom_tools')
    .select('webhook_url, http_method, headers, parameters')
    .eq('id', params.id)
    .eq('group_id', activeGroupId)
    .single()

  if (!tool) return NextResponse.json({ error: 'Tool not found' }, { status: 404 })

  // Build a sample input
  let body: { sample_input?: Record<string, unknown> } = {}
  try { body = await request.json() } catch { /* optional */ }

  const sampleInput = body.sample_input ?? (() => {
    const input: Record<string, unknown> = {}
    const params = (tool.parameters ?? []) as ToolParameter[]
    for (const p of params) {
      switch (p.type) {
        case 'string':  input[p.name] = `sample_${p.name}`; break
        case 'number':  input[p.name] = 42;                  break
        case 'boolean': input[p.name] = true;                break
        case 'array':   input[p.name] = ['example'];         break
      }
    }
    return input
  })()

  const headers = {
    'Content-Type': 'application/json',
    ...((tool.headers ?? {}) as Record<string, string>),
  }

  const startedAt = Date.now()
  try {
    const requestInit: RequestInit = {
      method:  tool.http_method,
      headers,
    }
    if (tool.http_method !== 'GET') {
      requestInit.body = JSON.stringify(sampleInput)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    requestInit.signal = controller.signal

    const res = await fetch(tool.webhook_url, requestInit)
    clearTimeout(timer)

    const elapsedMs = Date.now() - startedAt
    const contentType = res.headers.get('content-type') ?? ''
    let responseBody: unknown
    if (contentType.includes('application/json')) {
      try { responseBody = await res.json() } catch { responseBody = null }
    } else {
      const text = await res.text()
      responseBody = text.slice(0, 2000)  // cap raw text for safety
    }

    return NextResponse.json({
      data: {
        ok:           res.ok,
        status:       res.status,
        elapsed_ms:   elapsedMs,
        sample_input: sampleInput,
        response:     responseBody,
      },
    })
  } catch (err) {
    return NextResponse.json({
      data: {
        ok:           false,
        status:       0,
        elapsed_ms:   Date.now() - startedAt,
        sample_input: sampleInput,
        error:        err instanceof Error ? err.message : String(err),
      },
    })
  }
}
