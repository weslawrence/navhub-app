import Link from 'next/link'
import {
  ArrowRight, Building2, Bot, Shield, Plug, Check,
} from 'lucide-react'

export const metadata = {
  title:       'NavHub for enterprise',
  description: 'Corporate accounts, governed AI, and the controls your IT team needs.',
}

const SETUP_BULLETS = [
  'Multi-company group management',
  'Unlimited users with role-based access',
  'BYO AI model and API credentials',
  'Single sign-on ready (coming soon)',
]

const AGENT_BULLETS = [
  'Company background and industry context',
  'Internal documents and reference materials',
  'Process guidelines and output standards',
  'Web links to relevant resources',
  'Specific tools and data access permissions',
]

const ACCESS_CONTROL = [
  'Role-based permissions: Group Admin, Manager, Viewer',
  'Feature access per user (Financials, Reports, Documents, Marketing, Agents)',
  'Company-level access — users only see the entities they\u2019re assigned to',
]

const AI_GOV = [
  'Every agent run logged with user, timestamp, brief, tools used, tokens consumed',
  'Draft-first publishing — AI never publishes without human review',
  'Agent visibility controls — Private (creator only) or Public (team access)',
  'Web search requires explicit admin enablement — off by default',
]

const DATA_GOV = [
  'All data partitioned by organisation at database level',
  'AES-256-GCM encryption for all sensitive fields',
  'Supabase row-level security enforced at database layer',
]

const INTEGRATION_GROUPS: { heading: string; items: string }[] = [
  { heading: 'Financial',  items: 'Xero (connected) · MYOB (coming soon) · QuickBooks (coming soon)' },
  { heading: 'Documents',  items: 'SharePoint · Google Drive (coming soon) · Dropbox (coming soon)'  },
  { heading: 'Marketing',  items: 'Google Analytics · Meta · LinkedIn · Mailchimp (coming soon)'      },
  { heading: 'Custom',     items: 'Webhook tools — connect any internal system via API'              },
]

function BulletList({ items, accent = 'sky' }: { items: string[]; accent?: 'sky' | 'emerald' | 'violet' | 'rose' | 'amber' }) {
  const dot: Record<string, string> = {
    sky:     'bg-sky-400',
    emerald: 'bg-emerald-400',
    violet:  'bg-violet-400',
    rose:    'bg-rose-400',
    amber:   'bg-amber-400',
  }
  return (
    <ul className="space-y-2 pl-1">
      {items.map(line => (
        <li key={line} className="flex gap-3 text-sm text-slate-400 leading-relaxed">
          <span className={`mt-2 shrink-0 h-1.5 w-1.5 rounded-full ${dot[accent]}`} />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  )
}

export default function EnterprisePage() {
  return (
    <main className="pt-24 pb-20 text-white">
      {/* Hero */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto text-center space-y-6 py-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-medium font-[family-name:var(--font-dm-mono)] tracking-wide">
          <Building2 className="h-3.5 w-3.5" />
          Enterprise
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-[3.5rem] font-bold leading-[1.1] tracking-tight text-white">
          NavHub for enterprise
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Corporate accounts, governed AI, and the controls your IT team needs.
        </p>
      </section>

      {/* Corporate account setup */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto py-12 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <Building2 className="h-5 w-5 text-sky-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Your organisation, your setup</h2>
        </div>
        <p className="text-slate-400 leading-relaxed">
          Set up a corporate NavHub account in minutes. Add your companies, invite your team,
          and configure the AI models and providers your organisation has approved.
        </p>
        <BulletList items={SETUP_BULLETS} accent="sky" />
      </section>

      {/* Agent configuration */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto py-12 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-violet-500/10 border border-violet-500/20">
            <Bot className="h-5 w-5 text-violet-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">AI agents trained for your business</h2>
        </div>
        <p className="text-slate-400 leading-relaxed">
          NavHub agents aren&apos;t generic — they&apos;re configured with your organisation&apos;s specific
          knowledge, processes and outputs.
        </p>
        <p className="text-slate-300 font-medium">Configure each agent with:</p>
        <BulletList items={AGENT_BULLETS} accent="violet" />
        <p className="text-slate-400 leading-relaxed pt-2">
          The result: agents that understand your business and produce outputs that match your
          standards — not generic AI responses.
        </p>
      </section>

      {/* Governance */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto py-12 space-y-7">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <Shield className="h-5 w-5 text-rose-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">The controls your compliance team needs</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1626] p-6 space-y-3">
            <h3 className="text-base font-semibold text-white">Access control</h3>
            <BulletList items={ACCESS_CONTROL} accent="sky" />
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1626] p-6 space-y-3">
            <h3 className="text-base font-semibold text-white">AI governance</h3>
            <BulletList items={AI_GOV} accent="violet" />
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1626] p-6 space-y-3">
            <h3 className="text-base font-semibold text-white">Data governance</h3>
            <BulletList items={DATA_GOV} accent="emerald" />
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto py-12 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Plug className="h-5 w-5 text-amber-400" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">Your data ecosystem, connected</h2>
        </div>
        <div className="rounded-2xl border border-white/[0.08] divide-y divide-white/[0.05] overflow-hidden">
          {INTEGRATION_GROUPS.map(g => (
            <div key={g.heading} className="grid grid-cols-1 sm:grid-cols-[140px_1fr] bg-[#0d1626]/40">
              <div className="px-5 py-3 text-sm font-semibold text-white border-b sm:border-b-0 sm:border-r border-white/[0.05]">
                {g.heading}
              </div>
              <div className="px-5 py-3 text-sm text-slate-400">{g.items}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto pt-16 pb-4">
        <div className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-transparent to-violet-500/5 p-10 text-center space-y-4">
          <Check className="h-7 w-7 mx-auto text-sky-400" />
          <h3 className="text-xl sm:text-2xl font-bold text-white">Ready to deploy NavHub at your organisation?</h3>
          <p className="text-slate-400 max-w-xl mx-auto">
            We&apos;ll walk through your setup, governance requirements and integration plan.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-6 py-3 rounded-xl transition-all text-sm shadow-lg shadow-sky-500/20"
            >
              Request enterprise demo
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/security"
              className="inline-flex items-center gap-2 border border-white/15 hover:border-white/30 text-slate-300 hover:text-white font-medium px-6 py-3 rounded-xl transition-all text-sm"
            >
              Download security briefing
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
