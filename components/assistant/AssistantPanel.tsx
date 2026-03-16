'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm     from 'remark-gfm'
import {
  X, Plus, Send, Copy, Check, ExternalLink, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn }     from '@/lib/utils'
import type { AssistantContext, AssistantMessage } from '@/lib/assistant'

// ─── Suggested prompts ────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  'Help me brief an agent to generate a financial analysis',
  'How do I create a report template?',
  'Summarise what agents have run this week',
  'Help me set up a cash flow forecast',
]

// ─── Agent Brief Card ─────────────────────────────────────────────────────────

function AgentBriefCard({ brief }: { brief: string }) {
  const router  = useRouter()
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(brief)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleLaunch() {
    router.push(`/agents?brief=${encodeURIComponent(brief)}`)
  }

  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wide">
        <Sparkles className="h-3 w-3" />
        Agent Brief
      </div>
      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{brief}</p>
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5"
          onClick={() => void handleCopy()}
        >
          {copied
            ? <><Check className="h-3 w-3" /> Copied</>
            : <><Copy  className="h-3 w-3" /> Copy Brief</>}
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={handleLaunch}
        >
          <ExternalLink className="h-3 w-3" /> Launch Agent →
        </Button>
      </div>
    </div>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-1 px-3 py-2">
      {[0, 150, 300].map(delay => (
        <span
          key={delay}
          className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: AssistantMessage & { streaming?: boolean } }) {
  const isUser = msg.role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content || ' '}
            </ReactMarkdown>
            {(msg as { streaming?: boolean }).streaming && (
              <span className="inline-block w-1.5 h-3.5 bg-current animate-pulse ml-0.5 rounded-sm align-text-bottom" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Assistant Panel ──────────────────────────────────────────────────────────

interface AssistantPanelProps {
  isAdmin?: boolean
  onClose:  () => void
}

export default function AssistantPanel({ isAdmin = false, onClose }: AssistantPanelProps) {
  const pathname = usePathname()

  const [messages,  setMessages]  = useState<(AssistantMessage & { streaming?: boolean })[]>([])
  const [input,     setInput]     = useState('')
  const [streaming, setStreaming] = useState(false)
  const [context,   setContext]   = useState<AssistantContext | null>(null)

  const bottomRef  = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`  // max 4 lines ≈ 96px
  }, [input])

  // Load context (agents, templates, group info) once on mount
  useEffect(() => {
    async function loadContext() {
      try {
        const [groupRes, agentsRes, templatesRes] = await Promise.all([
          fetch('/api/groups/active'),
          fetch('/api/agents'),
          fetch('/api/report-templates'),
        ])
        const [groupJson, agentsJson, templatesJson] = await Promise.all([
          groupRes.json(),
          agentsRes.json(),
          templatesRes.json(),
        ])
        setContext({
          pathname,
          groupName:   groupJson.data?.group?.name ?? 'Unknown group',
          userRole:    groupJson.data?.role         ?? 'member',
          agents:      (agentsJson.data ?? []).map((a: { id: string; name: string; tools: string[] }) => ({
            id:    a.id,
            name:  a.name,
            tools: a.tools ?? [],
          })),
          templates: (templatesJson.data ?? []).map((t: { id: string; name: string; template_type: string }) => ({
            id:   t.id,
            name: t.name,
            type: t.template_type,
          })),
        })
      } catch {
        setContext({
          pathname,
          groupName:  'NavHub',
          userRole:   'member',
          agents:     [],
          templates:  [],
        })
      }
    }
    void loadContext()
  }, [pathname])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming || !context) return

    const userMsg: AssistantMessage = {
      id:      crypto.randomUUID(),
      role:    'user',
      content: text.trim(),
    }
    const assistantMsg: AssistantMessage & { streaming: boolean } = {
      id:        crypto.randomUUID(),
      role:      'assistant',
      content:   '',
      streaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    // Build conversation history for API
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content: text.trim() })

    try {
      const res = await fetch('/api/assistant/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: history,
          context,
          isAdmin,
        }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let event: Record<string, unknown>
          try { event = JSON.parse(line.slice(6)) } catch { continue }

          if (event.type === 'chunk') {
            const chunk = event.content as string
            setMessages(prev => prev.map(m =>
              m.id === assistantMsg.id
                ? { ...m, content: m.content + chunk }
                : m,
            ))
          } else if (event.type === 'done') {
            const brief       = event.brief as string | null
            const displayText = event.displayText as string | null

            setMessages(prev => prev.map(m => {
              if (m.id !== assistantMsg.id) return m
              return {
                ...m,
                streaming: false,
                brief,
                // Replace content with displayText if brief was extracted
                content: displayText ?? m.content,
              }
            }))
          } else if (event.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === assistantMsg.id
                ? { ...m, streaming: false, content: `Sorry, something went wrong. Please try again.` }
                : m,
            ))
          }
        }
      }
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsg.id
          ? { ...m, streaming: false, content: 'Sorry, I couldn\'t connect. Please try again.' }
          : m,
      ))
    } finally {
      setStreaming(false)
    }
  }, [messages, streaming, context, isAdmin])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-[420px] max-w-[100vw] bg-background border-l shadow-2xl flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center gap-2 px-4 py-3.5 border-b bg-background shrink-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-none">NavHub Assistant</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Powered by Claude</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            title="New conversation"
            onClick={() => setMessages([])}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Chat messages ── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            /* Suggested prompts */
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground text-center pt-2">
                How can I help you today?
              </p>
              <div className="space-y-2">
                {SUGGESTED_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    disabled={!context}
                    className={cn(
                      'w-full text-left text-sm px-3.5 py-2.5 rounded-lg border',
                      'text-muted-foreground hover:text-foreground hover:border-primary/40',
                      'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map(msg => (
                <div key={msg.id}>
                  <MessageBubble msg={msg} />
                  {/* Agent Brief Card — rendered below assistant message */}
                  {msg.role === 'assistant' && msg.brief && !msg.streaming && (
                    <div className="pl-0">
                      <AgentBriefCard brief={msg.brief} />
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator — shown while streaming but no text yet */}
              {streaming && messages.at(-1)?.content === '' && (
                <TypingIndicator />
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Input area ── */}
        <div className="shrink-0 border-t px-4 py-3 bg-background">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={context ? 'Ask anything about NavHub…' : 'Loading…'}
              disabled={!context || streaming}
              rows={1}
              className={cn(
                'flex-1 resize-none rounded-xl border border-input bg-muted/30',
                'px-3 py-2 text-sm placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'min-h-[38px] max-h-[96px] overflow-y-auto',
              )}
            />
            <Button
              size="sm"
              className="h-[38px] w-[38px] p-0 rounded-xl shrink-0"
              onClick={() => void sendMessage(input)}
              disabled={!input.trim() || !context || streaming}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  )
}
