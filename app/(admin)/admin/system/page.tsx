import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Required env vars ────────────────────────────────────────────────────────
const ENV_VARS: { key: string; label: string; required: boolean }[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL',       label: 'Supabase URL',           required: true  },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',  label: 'Supabase Anon Key',      required: true  },
  { key: 'SUPABASE_SERVICE_ROLE_KEY',      label: 'Supabase Service Role',   required: true  },
  { key: 'NAVHUB_ENCRYPTION_KEY',          label: 'Encryption Key',          required: true  },
  { key: 'ANTHROPIC_API_KEY',              label: 'Anthropic API Key',        required: true  },
  { key: 'XERO_CLIENT_ID',                 label: 'Xero Client ID',           required: false },
  { key: 'XERO_CLIENT_SECRET',             label: 'Xero Client Secret',       required: false },
  { key: 'RESEND_API_KEY',                 label: 'Resend API Key',           required: false },
  { key: 'RESEND_FROM_DOMAIN',             label: 'Resend From Domain',       required: false },
  { key: 'SUPPORT_EMAIL',                  label: 'Support Email',            required: false },
  { key: 'CRON_SECRET',                    label: 'Cron Secret',              required: false },
  { key: 'NEXT_PUBLIC_APP_URL',            label: 'App URL',                  required: true  },
]

// ─── DB tables to count ───────────────────────────────────────────────────────
const DB_TABLES = [
  'groups', 'companies', 'divisions', 'user_groups',
  'agents', 'agent_runs', 'agent_credentials',
  'financial_snapshots', 'xero_connections',
  'custom_reports', 'report_templates',
  'documents', 'document_folders',
  'cashflow_items', 'cashflow_snapshots',
  'forecast_streams',
  'support_requests', 'feature_suggestions',
]

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
  )
}

export default async function AdminSystemPage() {
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

  // ── DB row counts ────────────────────────────────────────────────────────────
  const countResults = await Promise.allSettled(
    DB_TABLES.map(table =>
      admin.from(table).select('*', { count: 'exact', head: true })
    )
  )

  const tableCounts: Record<string, number | null> = {}
  DB_TABLES.forEach((table, i) => {
    const r = countResults[i]
    tableCounts[table] = r.status === 'fulfilled' ? (r.value.count ?? null) : null
  })

  // ── Support requests + feature suggestions ──────────────────────────────────
  const [{ data: supportRequests }, { data: featureSuggestions }] = await Promise.all([
    admin.from('support_requests')
      .select('id, email, message, status, created_at, group_id')
      .order('created_at', { ascending: false })
      .limit(10),
    admin.from('feature_suggestions')
      .select('id, email, suggestion, status, created_at, group_id')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  // ── Recent errors ────────────────────────────────────────────────────────────
  const { data: errorRuns } = await admin
    .from('agent_runs')
    .select('id, error, created_at, agent_id, group_id')
    .eq('status', 'error')
    .order('created_at', { ascending: false })
    .limit(10)

  // Enrich error runs with names
  const agentIds = Array.from(new Set((errorRuns ?? []).map((r: { agent_id: string }) => r.agent_id)))
  const groupIds = Array.from(new Set((errorRuns ?? []).map((r: { group_id: string }) => r.group_id)))
  const ZERO    = '00000000-0000-0000-0000-000000000000'

  const [{ data: errAgents }, { data: errGroups }] = await Promise.all([
    admin.from('agents').select('id, name').in('id', agentIds.length > 0 ? agentIds : [ZERO]),
    admin.from('groups').select('id, name').in('id', groupIds.length > 0 ? groupIds : [ZERO]),
  ])

  const agentMap = Object.fromEntries((errAgents ?? []).map((a: { id: string; name: string }) => [a.id, a.name]))
  const groupMap = Object.fromEntries((errGroups ?? []).map((g: { id: string; name: string }) => [g.id, g.name]))

  // ── Storage check ─────────────────────────────────────────────────────────────
  const STORAGE_BUCKETS = ['report-files', 'excel-uploads', 'documents']
  const storageResults = await Promise.allSettled(
    STORAGE_BUCKETS.map(bucket =>
      admin.storage.from(bucket).list('', { limit: 1 })
    )
  )
  const bucketStatus: Record<string, boolean> = {}
  STORAGE_BUCKETS.forEach((bucket, i) => {
    const r = storageResults[i]
    bucketStatus[bucket] = r.status === 'fulfilled' && !r.value.error
  })

  function fmtDate(s: string | null) {
    if (!s) return '—'
    return new Date(s).toLocaleString('en-AU', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">System</h1>
        <p className="text-zinc-400 text-sm mt-1">Platform health, environment, and database overview.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Environment Variables */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-white">Environment Variables</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {ENV_VARS.map(({ key, label, required }) => {
              const isSet = Boolean(process.env[key])
              const bad   = required && !isSet
              return (
                <div key={key} className="flex items-center gap-3 px-5 py-2.5">
                  <StatusDot ok={isSet} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${bad ? 'text-red-400' : 'text-white'}`}>{label}</p>
                    <p className="text-xs text-zinc-500 font-mono">{key}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                    isSet ? 'bg-green-900 text-green-300' : (required ? 'bg-red-900 text-red-300' : 'bg-zinc-800 text-zinc-400')
                  }`}>
                    {isSet ? 'Set' : (required ? 'Missing' : 'Not set')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Storage Buckets */}
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-white">Storage Buckets</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {STORAGE_BUCKETS.map(bucket => (
                <div key={bucket} className="flex items-center gap-3 px-5 py-3">
                  <StatusDot ok={bucketStatus[bucket]} />
                  <p className="text-sm text-white font-mono flex-1">{bucket}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                    bucketStatus[bucket]
                      ? 'bg-green-900 text-green-300'
                      : 'bg-red-900 text-red-300'
                  }`}>
                    {bucketStatus[bucket] ? 'OK' : 'Error / Missing'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* DB Row Counts */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-white">Database Tables</h2>
            </div>
            <div className="grid grid-cols-2 divide-x divide-zinc-800">
              {DB_TABLES.map(table => (
                <div key={table} className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                  <p className="text-xs text-zinc-400 font-mono truncate">{table}</p>
                  <p className="text-sm font-medium text-white tabular-nums ml-2 shrink-0">
                    {tableCounts[table] !== null ? tableCounts[table]!.toLocaleString() : '?'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent errors */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white">Recent Agent Errors</h2>
        </div>
        {(errorRuns ?? []).length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-500">No errors — all clear.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {(errorRuns ?? []).map((run: {
              id: string; error: string | null; created_at: string; agent_id: string; group_id: string
            }) => (
              <div key={run.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-4 mb-1">
                  <p className="text-sm text-white">
                    <span className="font-medium">{agentMap[run.agent_id] ?? 'Unknown'}</span>
                    <span className="text-zinc-500 mx-1.5">·</span>
                    <span className="text-zinc-400">{groupMap[run.group_id] ?? 'Unknown'}</span>
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-zinc-500">{fmtDate(run.created_at)}</span>
                    <a
                      href={`/admin/agent-runs/${run.id}`}
                      className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-2 py-0.5 rounded transition-colors"
                    >
                      View
                    </a>
                  </div>
                </div>
                {run.error && (
                  <p className="text-xs text-red-400 font-mono line-clamp-2">{run.error}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Support Requests + Feature Suggestions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Support Requests */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Support Requests</h2>
            <span className="text-xs text-zinc-500">{(supportRequests ?? []).length} recent</span>
          </div>
          {(supportRequests ?? []).length === 0 ? (
            <p className="px-5 py-4 text-sm text-zinc-500">No support requests yet.</p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {(supportRequests ?? []).map((r: {
                id: string; email: string; message: string; status: string; created_at: string
              }) => (
                <div key={r.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <p className="text-sm text-white font-medium truncate">{r.email}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        r.status === 'open'
                          ? 'bg-amber-900 text-amber-300'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}>{r.status}</span>
                      <span className="text-xs text-zinc-500">{fmtDate(r.created_at)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2">{r.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Feature Suggestions */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Feature Suggestions</h2>
            <span className="text-xs text-zinc-500">{(featureSuggestions ?? []).length} recent</span>
          </div>
          {(featureSuggestions ?? []).length === 0 ? (
            <p className="px-5 py-4 text-sm text-zinc-500">No feature suggestions yet.</p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {(featureSuggestions ?? []).map((s: {
                id: string; email: string; suggestion: string; status: string; created_at: string
              }) => (
                <div key={s.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-4 mb-1">
                    <p className="text-sm text-white font-medium truncate">{s.email}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        s.status === 'new'
                          ? 'bg-blue-900 text-blue-300'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}>{s.status}</span>
                      <span className="text-xs text-zinc-500">{fmtDate(s.created_at)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2">{s.suggestion}</p>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
