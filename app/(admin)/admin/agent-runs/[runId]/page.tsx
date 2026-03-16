import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

const STATUS_BADGE: Record<string, string> = {
  queued:    'bg-zinc-700 text-zinc-300',
  running:   'bg-blue-900 text-blue-300',
  success:   'bg-green-900 text-green-300',
  error:     'bg-red-900 text-red-300',
  cancelled: 'bg-amber-900 text-amber-300',
}

const TOOL_EMOJI: Record<string, string> = {
  read_financials:         '📊',
  read_companies:          '🏢',
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

  // Fetch run record
  const { data: run } = await admin
    .from('agent_runs')
    .select('id, status, created_at, started_at, completed_at, output, tool_calls, tokens_used, error, agent_id, group_id')
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

  const toolCalls = (run.tool_calls ?? []) as ToolCallRecord[]

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/agent-runs"
              className="text-zinc-500 hover:text-white text-sm transition-colors"
            >
              ← Agent Runs
            </Link>
          </div>
          <h1 className="text-xl font-bold text-white mt-2 font-mono text-base">{run.id}</h1>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 mt-1 ${STATUS_BADGE[run.status] ?? STATUS_BADGE.queued}`}>
          {run.status}
        </span>
      </div>

      {/* Metadata cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Agent',    value: (agent as { name: string } | null)?.name ?? run.agent_id },
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
          <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono">{run.error}</pre>
        </div>
      )}

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-white">Tool Calls ({toolCalls.length})</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {toolCalls.map((tc, i) => (
              <details key={i} className="group">
                <summary className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-zinc-800/40 transition-colors list-none">
                  <span className="text-base">{TOOL_EMOJI[tc.tool] ?? '🔧'}</span>
                  <span className="text-sm font-medium text-white flex-1">{tc.tool}</span>
                  <span className="text-xs text-zinc-500 group-open:hidden">Details ›</span>
                  <span className="text-xs text-zinc-500 hidden group-open:inline">‹ Hide</span>
                </summary>
                <div className="px-5 pb-4 space-y-3 bg-zinc-800/20">
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
        </div>
      )}

      {/* Output */}
      {run.output && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-white">Agent Output</h2>
          </div>
          <div className="px-5 py-4">
            <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
              {run.output}
            </pre>
          </div>
        </div>
      )}

      {!run.output && toolCalls.length === 0 && run.status !== 'error' && (
        <p className="text-sm text-zinc-500 text-center py-8">No output recorded for this run.</p>
      )}
    </div>
  )
}
