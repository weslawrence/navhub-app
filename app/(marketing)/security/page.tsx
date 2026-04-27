import Link from 'next/link'
import { ArrowRight, Lock, Cpu, Database, KeyRound, Shield, FileText, FileLock2 } from 'lucide-react'

export const metadata = {
  title:       'Security & data governance — NavHub',
  description: 'NavHub is built on a simple principle — AI comes to your data. Your data never goes to public AI.',
}

const PROTECTIONS: { what: string; how: string }[] = [
  { what: 'Financial data',         how: 'Stays in database — AI receives only query results' },
  { what: 'Documents',              how: 'Folder-level access control per agent' },
  { what: 'AI outputs',             how: 'Draft by default — human publishes' },
  { what: 'API keys',               how: 'AES-256-GCM encrypted at rest' },
  { what: 'Conversation history',   how: 'Per-user isolation, never shared' },
  { what: 'Auth tokens',            how: 'Encrypted, time-limited signed URLs' },
]

const ZERO_RETENTION = [
  'Your data is not used to train AI models',
  'Data is not retained after each API call',
  'No persistent memory of your organisation between sessions',
]

const COMPLIANCE = [
  'Role-based access control (Admin, Manager, Viewer)',
  'Feature-level permissions per user per company',
  'Full audit log — every agent action logged with user, timestamp, data accessed',
  'Support access is read-only — writes blocked during impersonation',
  'Row-level security enforced at database layer, not just application layer',
]

export default function SecurityPage() {
  return (
    <main className="pt-24 pb-20 text-white">
      {/* Hero */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto text-center space-y-6 py-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-medium font-[family-name:var(--font-dm-mono)] tracking-wide">
          <Shield className="h-3.5 w-3.5" />
          Security &amp; governance
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-[3.5rem] font-bold leading-[1.1] tracking-tight text-white">
          Security &amp; data governance
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          NavHub is built on a simple principle —{' '}
          <span className="text-white">AI comes to your data.</span>{' '}
          Your data never goes to public AI.
        </p>
      </section>

      {/* IP Containment */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto py-12 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Lock className="h-5 w-5 text-emerald-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Your intellectual property stays yours</h2>
        </div>
        <p className="text-slate-400 leading-relaxed">
          The conventional AI risk: employees paste financial data, client information and strategic
          plans into public chat tools. Data leaves the organisation. No audit trail. No governance.
        </p>
        <p className="text-white font-medium">NavHub is different. Everything runs inside your workspace.</p>
        <ul className="space-y-2 pl-1">
          {[
            'Financial data stays in NavHub\u2019s database — only structured query results are passed to AI, never raw data dumps',
            'Documents are only accessible to agents with explicit permission',
            'Outputs default to Draft — human review required before publishing',
            'Nothing leaves your workspace unless a human explicitly exports it',
          ].map(line => (
            <li key={line} className="flex gap-3 text-sm text-slate-400 leading-relaxed">
              <span className="mt-2 shrink-0 h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Data handling table */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <Database className="h-5 w-5 text-sky-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Data handling at a glance</h2>
        </div>
        <div className="rounded-2xl border border-white/[0.08] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03]">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-slate-300">What we protect</th>
                <th className="text-left px-5 py-3 font-semibold text-slate-300">How</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {PROTECTIONS.map(p => (
                <tr key={p.what} className="bg-[#0d1626]/40">
                  <td className="px-5 py-3 text-white font-medium">{p.what}</td>
                  <td className="px-5 py-3 text-slate-400">{p.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Zero retention */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto py-12 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <Cpu className="h-5 w-5 text-violet-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Anthropic API — not the consumer product</h2>
        </div>
        <p className="text-slate-400 leading-relaxed">
          NavHub uses the Anthropic API, not Claude.ai. Under Anthropic&apos;s API terms:
        </p>
        <ul className="space-y-2 pl-1">
          {ZERO_RETENTION.map(line => (
            <li key={line} className="flex gap-3 text-sm text-slate-300 leading-relaxed">
              <span className="mt-0.5 shrink-0 text-emerald-400 font-bold">✓</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* BYO model */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto py-12 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <KeyRound className="h-5 w-5 text-amber-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Use your approved AI provider</h2>
        </div>
        <p className="text-slate-400 leading-relaxed">
          NavHub supports any AI provider — Anthropic, OpenAI, Google, Mistral or custom endpoints.
          Bring your own API key and use models already approved under your organisation&apos;s AI policy.
        </p>
      </section>

      {/* Compliance */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto py-12 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <FileLock2 className="h-5 w-5 text-rose-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Built for enterprise compliance</h2>
        </div>
        <ul className="space-y-2 pl-1">
          {COMPLIANCE.map(line => (
            <li key={line} className="flex gap-3 text-sm text-slate-400 leading-relaxed">
              <span className="mt-2 shrink-0 h-1.5 w-1.5 rounded-full bg-rose-400" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* CTA */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto pt-16 pb-4">
        <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-transparent to-violet-500/5 p-10 text-center space-y-4">
          <FileText className="h-7 w-7 mx-auto text-sky-400" />
          <h3 className="text-xl sm:text-2xl font-bold text-white">Want a deeper review?</h3>
          <p className="text-slate-400 max-w-xl mx-auto">
            We&apos;re happy to walk your IT and compliance teams through the full architecture.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-6 py-3 rounded-xl transition-all text-sm shadow-lg shadow-sky-500/20"
            >
              Request a demo
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 border border-white/15 hover:border-white/30 text-slate-300 hover:text-white font-medium px-6 py-3 rounded-xl transition-all text-sm"
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
