'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

type Context = 'templates' | 'skills' | 'knowledge'
type Msg = { role: 'user' | 'assistant'; content: string }

const QUICK_PROMPTS: Record<Context, string[]> = {
  templates: [
    'Draft a template for a Marketing Strategy agent.',
    'Review my Legal Document Review template — anything missing?',
    'What templates are we missing in our catalogue?',
  ],
  skills: [
    'Write a skill for reviewing M&A diligence reports.',
    'Suggest skills that should be added to the Financial Analyst template.',
  ],
  knowledge: [
    'Draft a platform knowledge entry on Australian contract law basics.',
    'What knowledge entries are we missing for the financial templates?',
  ],
}

export default function AdminBuilderPage() {
  const [context,  setContext]  = useState<Context>('templates')
  const [messages, setMessages] = useState<Msg[]>([])
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setError(null)
    const next: Msg[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const res = await fetch('/api/admin/builder', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ context, messages: next }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Builder request failed')
      setMessages(m => [...m, { role: 'assistant', content: json.data.text ?? '' }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSending(false)
    }
  }

  function reset() {
    setMessages([])
    setError(null)
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Builder Assistant</h1>
        <p className="text-xs text-zinc-400 mt-0.5 max-w-2xl">
          AI assistant for designing agent templates, platform skills and platform knowledge.
          Has read access to the full catalogue so it won&apos;t suggest duplicates and can
          recommend existing skills + knowledge for new templates.
        </p>
      </div>

      <div className="flex items-center gap-1">
        {(['templates','skills','knowledge'] as Context[]).map(c => (
          <button
            key={c}
            onClick={() => setContext(c)}
            className={`text-xs px-3 py-1.5 rounded border capitalize ${
              context === c
                ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >{c}</button>
        ))}
        {messages.length > 0 && (
          <button onClick={reset} className="ml-auto text-xs text-zinc-500 hover:text-zinc-200">
            New conversation
          </button>
        )}
      </div>

      {messages.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
          <p className="text-xs text-zinc-400">Try one of these to get started:</p>
          <div className="flex flex-col gap-2">
            {QUICK_PROMPTS[context].map(q => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={sending}
                className="text-left text-xs px-3 py-2 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
              >{q}</button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg border px-4 py-3 ${
              m.role === 'user'
                ? 'border-zinc-700 bg-zinc-900/60'
                : 'border-violet-500/30 bg-violet-500/5'
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
              {m.role === 'user' ? 'You' : 'Builder'}
            </p>
            <pre className="text-sm text-zinc-100 whitespace-pre-wrap font-sans">{m.content}</pre>
          </div>
        ))}
        {sending && (
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 px-4 py-3 flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
            <span className="text-xs text-violet-300">Thinking…</span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-2 sticky bottom-4">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(input)
            }
          }}
          placeholder="Ask the Builder…  (Enter to send, Shift+Enter for newline)"
          rows={3}
          className="flex-1 text-sm px-3 py-2 rounded border border-zinc-700 bg-zinc-900 text-zinc-100"
        />
        <button
          onClick={() => void send(input)}
          disabled={sending || !input.trim()}
          className="text-xs px-4 rounded bg-violet-500 text-zinc-900 font-semibold hover:bg-violet-400 disabled:opacity-60"
        >Send</button>
      </div>
    </div>
  )
}
