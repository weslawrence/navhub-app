import { NextResponse }    from 'next/server'
import { cookies }         from 'next/headers'
import { createClient }    from '@/lib/supabase/server'
import { buildSystemPrompt, extractBrief } from '@/lib/assistant'
import type { AssistantContext } from '@/lib/assistant'

interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
}

interface ChatRequestBody {
  messages: ChatMessage[]
  context:  AssistantContext
  isAdmin?: boolean
}

export const runtime = 'nodejs'

export async function POST(request: Request) {
  // Auth check
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Active group check
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) return NextResponse.json({ error: 'No active group' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  let body: ChatRequestBody
  try {
    body = await request.json() as ChatRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { messages, context, isAdmin = false } = body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }

  const systemPrompt = buildSystemPrompt(context, isAdmin)

  // Call Anthropic API with streaming
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   messages.map(m => ({ role: m.role, content: m.content })),
      stream:     true,
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json().catch(() => ({})) as { error?: { message?: string } }
    return NextResponse.json(
      { error: `Anthropic API error: ${err.error?.message ?? anthropicRes.statusText}` },
      { status: 502 },
    )
  }

  const upstreamReader = anthropicRes.body?.getReader()
  if (!upstreamReader) {
    return NextResponse.json({ error: 'No response body' }, { status: 502 })
  }

  // SSE stream back to the client
  const encoder   = new TextEncoder()
  const decoder   = new TextDecoder()

  const stream = new ReadableStream({
    async start(controller) {
      let buffer   = ''
      let fullText = ''

      try {
        while (true) {
          const { done, value } = await upstreamReader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            let event: Record<string, unknown>
            try { event = JSON.parse(data) } catch { continue }

            if (event.type === 'content_block_delta') {
              const delta = event.delta as { type?: string; text?: string }
              if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                fullText += delta.text
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'chunk', content: delta.text })}\n\n`,
                  ),
                )
              }
            }
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`,
          ),
        )
      } finally {
        // Extract brief (if any) and send done event
        const { displayText, brief } = extractBrief(fullText)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type:        'done',
              brief,
              displayText: brief ? displayText : null,  // only send displayText when brief found
            })}\n\n`,
          ),
        )
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
