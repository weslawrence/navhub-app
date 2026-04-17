import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CollapsibleSection from '@/components/ui/CollapsibleSection'

const STATUS_BADGE: Record<string, string> = {
  queued:    'bg-zinc-700 text-zinc-300',
  running:   'bg-blue-900 text-blue-300',
  success:   'bg-green-900 text-green-300',
  error:     'bg-red-900 text-red-300',
  cancelled: 'bg-amber-900 text-amber-300',
}

const TOOL_EMOJI: Record<string, string> = {
  read_financials:         '📊',
  generate_report:         '📄',
  send_slack:              '💬',
  send_email:              '📧',
  list_report_templates:   '📋',
  read_report_template:    '🔍',
  create_report_template:  '🆕',
  update_report_template:  '✏️',
  render_report:           '🖨️',
  analyse_document:        '🔬',
  list_documents:          '📂',
  read_document:           '📖',
  create_document:         '📝',
  update_document:         '✍️',
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

interface ToolCallRecord {
  tool:       string
  input?:     unknown
  output?:    string
  started_at?: string
  ended_at?:   string
}

interface InputContext {
  period?:             string
  company_ids?:        string[]
  extra_instructions?: string
}

export default async function AdminRunDetailPage({ params }: { params: { runId: string } }) {
  // Auth + super_admin check
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const admin = createAdminClient()
  const { data: memberships } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', session.user.id)
    .eq('role', 'super_admin')
  if (!memberships || memberships.length === 0) redirect('/dashboard')

  // Fetch run record — include input_context for Brief section
  const { data: run } = await admin
    .from('agent_runs')
    .select('id, status, created_at, started_at, completed_at, output, tool_calls, tokens_used, error, agent_id, group_id, input_context, model_used')
    .eq('id', params.runId)
    .single()

  if (!run) notFound()

  // Enrich with agent + group names
  const [{ data: agent }, { data: group }] = await Promise.all([
    admin.from('agents').select('id, name, model').eq('id', run.agent_id).single(),
    admin.from('groups').select('id, name').eq('id', run.group_id).single(),
  ])

  const durationMs = run.started_at && run.completed_at
    ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
    : null

  const toolCalls    = (run.tool_calls ?? []) as ToolCallRecord[]
  const inputContext = (run.input_context ?? {}) as InputContext

  const promptText  = inputContext.extra_instructions ?? ''
  const briefBadge  = promptText
    ? (promptText.length > 60 ? promptText.slice(0, 57) + '…' : promptText)
    : 'No additional instructions'

  const agentName = (agent as { name: string } | null)?.name ?? run.agent_id
  const modelLabel = run.model_used
    ? run.model_used.includes('opus') ? 'Claude Opus 4'
      : run.model_used === 'gpt-4o'   ? 'GPT-4o'
      : 'Claude Sonnet 4'
    : null

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/agent-runs"
            className="text-zinc-500 hover:text-white text-sm transition-colors"
          >
            ← Agent Runs
          </Link>
          <h1 className="text-base font-bold text-white mt-2 font-mono">{run.id}</h1>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 mt-1 ${STATUS_BADGE[run.status] ?? STATUS_BADGE.queued}`}>
          {run.status}
        </span>
      </div>

      {/* Metadata cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Agent',    value: agentName },
          { label: 'Group',    value: (group as { name: string } | null)?.name ?? run.group_id },
          { label: 'Duration', value: durationMs !== null ? `${Math.round(durationMs / 1000)}s` : '—' },
          { label: 'Tokens',   value: run.tokens_used ? run.tokens_used.toLocaleString() : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
            <p className="text-sm font-medium text-white mt-1 truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Timestamps */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Created</p>
          <p className="text-zinc-300">{fmtDate(run.created_at)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Started</p>
          <p className="text-zinc-300">{fmtDate(run.started_at)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Completed</p>
          <p className="text-zinc-300">{fmtDate(run.completed_at)}</p>
        </div>
      </div>

      {/* Error block */}
      {run.error && (
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-4">
          <p className="text-xs text-red-400 uppercase tracking-wide font-medium mb-2">Error</p>
          <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono">{run.error as string}</pre>
        </div>
      )}

      {/* ── Brief section ── */}
      <CollapsibleSection
        title="Brief"
        defaultOpen={false}
        badge={briefBadge}
        className="bg-zinc-900 border-zinc-800"
        headerClassName="hover:bg-zinc-800/50"
      >
        <div className="space-y-3 pt-0.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Prompt</p>
            {promptText ? (
              <p className="text-sm text-zinc-200 leading-relaxed">{promptText}</p>
            ) : (
              <p className="text-sm text-zinc-500 italic">No additional instructions</p>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-sm">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mr-2">Agent</span>
              <span className="text-zinc-300">{agentName}</span>
            </div>
            {modelLabel && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mr-2">Model</span>
                <span className="text-zinc-300">{modelLabel}</span>
              </div>
            )}
            {inputContext.period && (
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mr-2">Period</span>
                <span className="text-zinc-300">{inputContext.period}</span>
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Activity: Tool calls ── */}
      <CollapsibleSection
        title="Activity"
        defaultOpen={true}
        badge={toolCalls.length > 0 ? `${toolCalls.length} tool call${toolCalls.length !== 1 ? 's' : ''}` : 'No tool calls'}
        className="bg-zinc-900 border-zinc-800"
        headerClassName="hover:bg-zinc-800/50"
      >
        {toolCalls.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">No tool calls recorded</p>
        ) : (
          <div className="divide-y divide-zinc-800 -mx-4">
            {toolCalls.map((tc, i) => (
              <details key={i} className="group">
                <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/40 transition-colors list-none">
                  <span className="text-base">{TOOL_EMOJI[tc.tool] ?? '🔧'}</span>
                  <span className="text-sm font-medium text-white flex-1">{tc.tool}</span>
                  <span className="text-xs text-zinc-500 group-open:hidden">Details ›</span>
                  <span className="text-xs text-zinc-500 hidden group-open:inline">‹ Hide</span>
                </summary>
                <div className="px-4 pb-4 space-y-3 bg-zinc-800/20">
                  {tc.input !== undefined && (
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Input</p>
                      <pre className="text-xs text-zinc-300 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(tc.input, null, 2)}
                      </pre>
                    </div>
                  )}
                  {tc.output !== undefined && (
                    <div>
                      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Output</p>
                      <pre className="text-xs text-zinc-300 bg-zinc-950 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-60">
                        {typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Output ── */}
      <CollapsibleSection
        title="Output"
        defaultOpen={true}
        badge={run.output ? `~${run.output.trim().split(/\s+/).length.toLocaleString()} words` : (run.error ? 'Error' : '—')}
        className="bg-zinc-900 border-zinc-800"
        headerClassName="hover:bg-zinc-800/50"
      >
        {run.output ? (
          <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
            {run.output as string}
          </pre>
        ) : (
          <p className="text-sm text-zinc-500 italic">
            {run.status === 'cancelled' ? 'Run was cancelled before producing output.' : 'No output recorded.'}
          </p>
        )}
      </CollapsibleSection>
    </div>
  )
}
