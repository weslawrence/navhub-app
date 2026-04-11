'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm     from 'remark-gfm'
import {
  X, Plus, Send, Copy, Check, ExternalLink, Sparkles,
  Maximize2, Minimize2, History, ChevronLeft, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn }     from '@/lib/utils'
import type { AssistantMessage, AssistantQuestion } from '@/lib/assistant'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WIDTH  = 480
const DEFAULT_HEIGHT = 640
const MIN_WIDTH      = 300
const MIN_HEIGHT     = 400
const MAX_WIDTH      = 800
const MAX_HEIGHT     = 900

const STORAGE_KEY_POSITION = 'navhub:assistant:position'
const STORAGE_KEY_SIZE     = 'navhub:assistant:size'

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelMessage = AssistantMessage & { streaming?: boolean }

interface ConvSummary {
  id:         string
  title:      string
  updated_at: string
}

// ─── Suggested prompts ────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  'Help me brief an agent to generate a financial analysis',
  'How do I create a report template?',
  'Summarise what agents have run this week',
  'Help me set up a cash flow forecast',
]

// ─── Question Card ────────────────────────────────────────────────────────────

function QuestionCard({
  q,
  onConfirm,
  answered,
}: {
  q:         AssistantQuestion
  onConfirm: (answer: string) => void
  answered?: boolean
}) {
  const [selected, setSelected] = useState<string[]>([])

  function toggle(opt: string) {
    if (answered) return
    if (q.multiSelect) {
      setSelected(prev => prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt])
    } else {
      setSelected([opt])
    }
  }

  function handleConfirm() {
    if (selected.length === 0 || answered) return
    onConfirm(selected.join(', '))
  }

  return (
    <div
      className={cn(
        'mt-2 rounded-lg border p-3 space-y-2.5',
        answered
          ? 'border-border bg-muted/20 opacity-60'
          : 'border-amber-400/50 bg-amber-950/10 dark:bg-amber-950/20',
      )}
    >
      <p className="text-sm font-medium text-foreground">{q.question}</p>
      <div className="space-y-1.5">
        {q.options.map(opt => (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            disabled={answered}
            className={cn(
              'w-full text-left text-sm px-3 py-2 rounded-lg border transition-colors',
              selected.includes(opt) && !answered
                ? 'border-amber-400 bg-amber-400/10 text-foreground'
                : 'border-border text-muted-foreground hover:border-amber-400/50 hover:text-foreground',
              answered && 'cursor-not-allowed',
            )}
          >
            {opt}
          </button>
        ))}
      </div>
      {!answered && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-amber-400/50 hover:border-amber-400 hover:bg-amber-400/10"
          disabled={selected.length === 0}
          onClick={handleConfirm}
        >
          Confirm
        </Button>
      )}
    </div>
  )
}

// ─── Agent Brief Card ─────────────────────────────────────────────────────────

function extractAgentName(text: string): string | null {
  // Match patterns like:
  // "I'll brief Report Builder Bob"
  // "Agent: HR Officer Jenny"
  // "briefing HR Officer Jenny"
  // "use Report Builder Bob"
  // "sending to Finance Analyst"
  // **Agent Name** in markdown bold
  const patterns = [
    /(?:brief|briefing|use|ask|sending to|agent[:\s]+)\s+([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)*)/,
    /\*\*([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)*)\*\*/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1] && match[1].length > 2) return match[1]
  }
  return null
}

function AgentBriefCard({
  brief,
  msgContent,
  onClose,
}: {
  brief:       string
  msgContent?: string
  onClose?:    () => void
}) {
  const router  = useRouter()
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(brief)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleLaunch() {
    onClose?.()
    const agentName = msgContent ? extractAgentName(msgContent) : null
    const params    = new URLSearchParams({ brief: brief })
    if (agentName) params.set('agent_name', agentName)
    router.push(`/agents?${params.toString()}`)
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

function MessageBubble({ msg }: { msg: PanelMessage }) {
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
            {msg.streaming && (
              <span className="inline-block w-1.5 h-3.5 bg-current animate-pulse ml-0.5 rounded-sm align-text-bottom" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Relative date helper ─────────────────────────────────────────────────────

function relativeDate(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return new Date(isoString).toLocaleDateString()
}

// ─── Assistant Panel ──────────────────────────────────────────────────────────

interface AssistantPanelProps {
  isAdmin?:  boolean
  onClose:   () => void
  groupId?:  string
}

export default function AssistantPanel({ isAdmin = false, onClose, groupId }: AssistantPanelProps) {
  const pathname = usePathname()

  const [messages,          setMessages]          = useState<PanelMessage[]>([])
  const [input,             setInput]             = useState('')
  const [streaming,         setStreaming]         = useState(false)
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())

  // Minimal context — just pathname + role; server builds the full context
  const [userRole,     setUserRole]     = useState('member')
  const [contextReady, setContextReady] = useState(false)

  // ── Position & size ──
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const [size,     setSize]     = useState<{ width: number; height: number }>({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT })

  // ── Maximise ──
  const [maximised, setMaximised] = useState(false)

  // ── History sidebar ──
  const [showHistory,    setShowHistory]    = useState(false)
  const [conversations,  setConversations]  = useState<ConvSummary[]>([])
  const [currentConvId,  setCurrentConvId]  = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  // Ref to track current conversation ID synchronously (used in callbacks + effects)
  const currentConvIdRef = useRef<string | null>(null)
  const saveTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Drag state ──
  const dragging    = useRef(false)
  const dragOffset  = useRef({ x: 0, y: 0 })

  // ── Resize state ──
  const resizing         = useRef<'left' | 'bottom' | null>(null)
  const resizeStartX     = useRef(0)
  const resizeStartY     = useRef(0)
  const resizeStartW     = useRef(0)
  const resizeStartH     = useRef(0)
  const resizeStartLeft  = useRef(0)

  const bottomRef   = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef    = useRef<HTMLDivElement>(null)

  // ── Load position/size from localStorage ──
  useEffect(() => {
    try {
      const savedPos = localStorage.getItem(STORAGE_KEY_POSITION)
      if (savedPos) setPosition(JSON.parse(savedPos) as { x: number; y: number })
      const savedSize = localStorage.getItem(STORAGE_KEY_SIZE)
      if (savedSize) {
        const s = JSON.parse(savedSize) as { width: number; height: number }
        setSize({
          width:  Math.min(Math.max(s.width,  MIN_WIDTH),  MAX_WIDTH),
          height: Math.min(Math.max(s.height, MIN_HEIGHT), MAX_HEIGHT),
        })
      }
    } catch { /* ignore */ }
  }, [])

  // ── loadConversation ──
  const loadConversation = useCallback(async (id: string) => {
    try {
      const res  = await fetch(`/api/assistant/conversations/${id}`)
      const json = await res.json() as { data?: { messages: PanelMessage[] } }
      if (json.data) {
        setMessages(json.data.messages ?? [])
        currentConvIdRef.current = id
        setCurrentConvId(id)
        setAnsweredQuestions(new Set())
      }
    } catch { /* ignore */ }
  }, [])

  // ── Load conversation history from DB on mount ──
  useEffect(() => {
    if (!groupId) return
    async function loadHistory() {
      setHistoryLoading(true)
      try {
        const res  = await fetch('/api/assistant/conversations')
        const json = await res.json() as { data?: ConvSummary[] }
        const convs = json.data ?? []
        setConversations(convs)
        // Auto-load most recent conversation
        if (convs.length > 0) {
          await loadConversation(convs[0].id)
        }
      } catch { /* ignore */ }
      setHistoryLoading(false)
    }
    void loadHistory()
  }, [groupId, loadConversation])

  // ── Fetch user role once on mount ──
  useEffect(() => {
    async function loadRole() {
      try {
        const res  = await fetch('/api/groups/active')
        const json = await res.json() as { data?: { role?: string } }
        setUserRole(json.data?.role ?? 'member')
      } catch { /* use default */ }
      setContextReady(true)
    }
    void loadRole()
  }, [])

  // ── Debounced DB persistence when messages change ──
  useEffect(() => {
    const convId = currentConvIdRef.current
    if (!convId || messages.length === 0) return

    // Don't save in-flight streaming messages
    const nonStreaming = messages.filter(m => !m.streaming)
    if (nonStreaming.length === 0) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void fetch(`/api/assistant/conversations/${convId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: nonStreaming }),
      }).then(() => {
        setConversations(prev => prev.map(c =>
          c.id === convId ? { ...c, updated_at: new Date().toISOString() } : c,
        ))
      }).catch(() => { /* ignore */ })
    }, 1000)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [messages])

  // ── Scroll to bottom on new messages ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Auto-resize textarea ──
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 96)}px`  // max 4 lines ≈ 96px
  }, [input])

  // ── Default position (bottom-right, offset from corner) ──
  function getDefaultPosition(): { x: number; y: number } {
    if (typeof window === 'undefined') return { x: 0, y: 0 }
    return {
      x: window.innerWidth  - size.width  - 24,
      y: window.innerHeight - size.height - 24,
    }
  }

  function resolvedPosition(): { x: number; y: number } {
    return position ?? getDefaultPosition()
  }

  // ── Drag handlers (disabled when maximised) ──
  function handleHeaderMouseDown(e: React.MouseEvent) {
    if (maximised) return
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    const pos = resolvedPosition()
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging.current) {
      const newX = Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth  - size.width))
      const newY = Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - size.height))
      setPosition({ x: newX, y: newY })
    }

    if (resizing.current === 'left') {
      const deltaX  = resizeStartX.current - e.clientX
      const newW    = Math.min(Math.max(resizeStartW.current + deltaX, MIN_WIDTH), MAX_WIDTH)
      const newLeft = resizeStartLeft.current + (resizeStartW.current - newW)
      setSize(s  => ({ ...s, width: newW }))
      setPosition(p => ({ x: newLeft, y: (p ?? getDefaultPosition()).y }))
    }

    if (resizing.current === 'bottom') {
      const deltaY = e.clientY - resizeStartY.current
      const newH   = Math.min(Math.max(resizeStartH.current + deltaY, MIN_HEIGHT), MAX_HEIGHT)
      setSize(s => ({ ...s, height: newH }))
    }
  }, [size.width]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseUp = useCallback(() => {
    if (dragging.current) {
      dragging.current = false
      try {
        localStorage.setItem(STORAGE_KEY_POSITION, JSON.stringify(position ?? getDefaultPosition()))
      } catch { /* ignore */ }
    }
    if (resizing.current) {
      resizing.current = null
      try {
        localStorage.setItem(STORAGE_KEY_SIZE, JSON.stringify(size))
      } catch { /* ignore */ }
    }
  }, [position, size]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup',   handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup',   handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  // ── Resize handle mouse down ──
  function handleLeftResizeMouseDown(e: React.MouseEvent) {
    if (maximised) return
    e.preventDefault()
    resizing.current      = 'left'
    resizeStartX.current  = e.clientX
    resizeStartW.current  = size.width
    resizeStartLeft.current = resolvedPosition().x
  }

  function handleBottomResizeMouseDown(e: React.MouseEvent) {
    if (maximised) return
    e.preventDefault()
    resizing.current     = 'bottom'
    resizeStartY.current = e.clientY
    resizeStartH.current = size.height
  }

  // ── Delete conversation ──
  const deleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/assistant/conversations/${id}`, { method: 'DELETE' })
      setConversations(prev => prev.filter(c => c.id !== id))
      if (currentConvIdRef.current === id) {
        setMessages([])
        setAnsweredQuestions(new Set())
        currentConvIdRef.current = null
        setCurrentConvId(null)
      }
    } catch { /* ignore */ }
  }, [])

  // ── New conversation ──
  function handleNewConversation() {
    setMessages([])
    setAnsweredQuestions(new Set())
    currentConvIdRef.current = null
    setCurrentConvId(null)
    setShowHistory(false)
  }

  // ── Send message ──
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming || !contextReady) return

    const userMsg: PanelMessage = {
      id:      crypto.randomUUID(),
      role:    'user',
      content: text.trim(),
    }
    const assistantMsg: PanelMessage = {
      id:        crypto.randomUUID(),
      role:      'assistant',
      content:   '',
      streaming: true,
    }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setStreaming(true)

    // Create DB conversation on first message if none exists
    let convId = currentConvIdRef.current
    if (!convId) {
      try {
        const convRes  = await fetch('/api/assistant/conversations', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ title: text.trim().slice(0, 60) }),
        })
        const convJson = await convRes.json() as { data?: { id: string; title: string; updated_at: string } }
        if (convJson.data?.id) {
          convId = convJson.data.id
          currentConvIdRef.current = convId
          setCurrentConvId(convId)
          setConversations(prev => [convJson.data!, ...prev])
        }
      } catch { /* continue without DB persistence */ }
    }

    // Build conversation history for API
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content: text.trim() })

    const context = { pathname, userRole }

    try {
      const res = await fetch('/api/assistant/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: history, context, isAdmin }),
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
            const brief       = event.brief       as string | null
            const displayText = event.displayText as string | null
            const question    = event.question    as import('@/lib/assistant').AssistantQuestion | null

            setMessages(prev => prev.map(m => {
              if (m.id !== assistantMsg.id) return m
              return {
                ...m,
                streaming: false,
                brief,
                question,
                content: displayText ?? m.content,
              }
            }))
          } else if (event.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === assistantMsg.id
                ? { ...m, streaming: false, content: 'Sorry, something went wrong. Please try again.' }
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
  }, [messages, streaming, contextReady, pathname, userRole, isAdmin])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage(input)
    }
  }

  // ── Panel style — normal vs maximised ──
  const pos = resolvedPosition()
  const panelStyle = maximised
    ? {
        position: 'fixed' as const,
        left:     '5vw',
        top:      '5vh',
        width:    '90vw',
        height:   '90vh',
      }
    : {
        left:   pos.x,
        top:    pos.y,
        width:  size.width,
        height: size.height,
      }

  return (
    <>
      {/* Non-blocking backdrop — pointer events disabled so clicks pass through */}
      <div
        className="fixed inset-0 z-40 bg-black/10"
        style={{ pointerEvents: 'none' }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed z-50 bg-background border shadow-2xl flex flex-col rounded-xl overflow-hidden"
        style={panelStyle}
      >
        {/* ── Left resize handle (disabled when maximised) ── */}
        {!maximised && (
          <div
            onMouseDown={handleLeftResizeMouseDown}
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-10 hover:bg-primary/20 transition-colors"
          />
        )}

        {/* ── Bottom resize handle (disabled when maximised) ── */}
        {!maximised && (
          <div
            onMouseDown={handleBottomResizeMouseDown}
            className="absolute left-0 right-0 bottom-0 h-1.5 cursor-ns-resize z-10 hover:bg-primary/20 transition-colors"
          />
        )}

        {/* ── Header (drag target) ── */}
        <div
          onMouseDown={handleHeaderMouseDown}
          className={cn(
            'flex items-center gap-1.5 px-4 py-3.5 border-b bg-background shrink-0 select-none',
            !maximised && 'cursor-grab active:cursor-grabbing',
          )}
        >
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-none">NavHub Assistant</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Powered by Claude</p>
          </div>

          {/* History */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            title="Conversation history"
            onClick={() => setShowHistory(true)}
          >
            <History className="h-4 w-4" />
          </Button>

          {/* New conversation */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            title="New conversation"
            onClick={handleNewConversation}
          >
            <Plus className="h-4 w-4" />
          </Button>

          {/* Maximise / restore */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            title={maximised ? 'Restore' : 'Maximise'}
            onClick={() => setMaximised(m => !m)}
          >
            {maximised
              ? <Minimize2 className="h-4 w-4" />
              : <Maximize2 className="h-4 w-4" />}
          </Button>

          {/* Close */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ── History sidebar (absolute overlay, slides in from left) ── */}
        <div
          className={cn(
            'absolute inset-0 z-20 bg-background flex flex-col transition-transform duration-200',
            showHistory ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {/* History header */}
          <div className="flex items-center gap-2 px-4 py-3.5 border-b shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setShowHistory(false)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm font-semibold flex-1">Conversations</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 px-2"
              onClick={handleNewConversation}
            >
              <Plus className="h-3.5 w-3.5" /> New
            </Button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {historyLoading ? (
              <p className="text-center text-sm text-muted-foreground py-8">Loading…</p>
            ) : conversations.length === 0 ? (
              <div className="text-center py-12 px-4">
                <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No conversations yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Start chatting to save history</p>
              </div>
            ) : (
              conversations.map(conv => (
                <div
                  key={conv.id}
                  className={cn(
                    'group flex items-start gap-2 px-4 py-3 border-b cursor-pointer',
                    'hover:bg-muted/50 transition-colors',
                    conv.id === currentConvId && 'bg-primary/5 border-l-2 border-l-primary',
                  )}
                  onClick={() => void loadConversation(conv.id).then(() => setShowHistory(false))}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{conv.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {relativeDate(conv.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => void deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 mt-0.5 p-0.5 rounded"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
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
                    disabled={!contextReady}
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
                      <AgentBriefCard brief={msg.brief} msgContent={msg.content} onClose={onClose} />
                    </div>
                  )}

                  {/* Question Card — rendered below assistant message */}
                  {msg.role === 'assistant' && msg.question && !msg.streaming && (
                    <div className="pl-0">
                      <QuestionCard
                        q={msg.question}
                        answered={answeredQuestions.has(msg.id)}
                        onConfirm={(answer) => {
                          setAnsweredQuestions(prev => { const s = new Set(prev); s.add(msg.id); return s })
                          void sendMessage(answer)
                        }}
                      />
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
              placeholder={contextReady ? 'Ask anything about NavHub…' : 'Loading…'}
              disabled={!contextReady || streaming}
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
              disabled={!input.trim() || !contextReady || streaming}
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
