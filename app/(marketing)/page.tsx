import Link from 'next/link'
import { ArrowRight, Shield, Zap, FileText, LayoutGrid, Check } from 'lucide-react'

// ─── Hero animated mesh gradient (CSS keyframes injected inline) ─────────────
function HeroBackground() {
  return (
    <>
      <style>{`
        @keyframes mesh-drift-1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33%       { transform: translate(40px, -30px) scale(1.08); }
          66%       { transform: translate(-20px, 20px) scale(0.96); }
        }
        @keyframes mesh-drift-2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33%       { transform: translate(-30px, 40px) scale(1.06); }
          66%       { transform: translate(25px, -15px) scale(0.97); }
        }
        @keyframes mesh-drift-3 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50%       { transform: translate(20px, 30px) scale(1.05); }
        }
        .mesh-blob-1 { animation: mesh-drift-1 12s ease-in-out infinite; }
        .mesh-blob-2 { animation: mesh-drift-2 15s ease-in-out infinite; }
        .mesh-blob-3 { animation: mesh-drift-3 10s ease-in-out infinite reverse; }
      `}</style>

      {/* Dark gradient base */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#080c14] via-[#0a101c] to-[#080c14]" />

      {/* Animated colour orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Blue orb — upper left */}
        <div className="mesh-blob-1 absolute -top-40 -left-20 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.12) 0%, transparent 70%)' }}
        />
        {/* Purple orb — upper right */}
        <div className="mesh-blob-2 absolute -top-20 right-0 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 70%)' }}
        />
        {/* Cyan orb — bottom center */}
        <div className="mesh-blob-3 absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)' }}
        />
      </div>

      {/* Noise texture overlay for depth */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '128px' }}
      />
    </>
  )
}

// ─── Sections ────────────────────────────────────────────────────────────────

const CAPABILITIES = [
  {
    icon:  <LayoutGrid className="h-5 w-5 text-sky-400" />,
    title: 'Financial Intelligence',
    body:  'Connect Xero or upload your data. Get real-time P&L, Balance Sheet, and cash flow forecasts across all your entities — consolidated or drilled down.',
  },
  {
    icon:  <Zap className="h-5 w-5 text-violet-400" />,
    title: 'AI Agents — Your Team of One',
    body:  'Configure agents with a personality, a skill set, and a task list. Set them running on a schedule or on demand. They report back, ask when they need to, and store everything in NavHub.',
  },
  {
    icon:  <FileText className="h-5 w-5 text-emerald-400" />,
    title: 'Report & Document Generation',
    body:  'Agents build report templates, generate analysis, write job descriptions, draft board papers — anything your business needs. Output syncs to SharePoint or Google Drive automatically.',
  },
  {
    icon:  <Shield className="h-5 w-5 text-amber-400" />,
    title: 'Full Control, Always',
    body:  'Choose which tools each agent can use. Connect your own AI API key or use NavHub\'s. Kill any task instantly. Review full audit trails of every action, brief, and output.',
  },
]

const TRUST_POINTS = [
  {
    title: 'Choose your model',
    body:  'Use NavHub\'s included AI or connect your own Anthropic, OpenAI, or other API key. Switch at any time.',
  },
  {
    title: 'Set the tools',
    body:  'Decide exactly what each agent can access — financial data, documents, external apps. Nothing runs outside its permissions.',
  },
  {
    title: 'Kill switch',
    body:  'Cancel any running task instantly. Disable or remove any agent at any time.',
  },
  {
    title: 'Full audit trail',
    body:  'Every brief, every tool call, every output is logged and stored — even if you change models or platforms later.',
  },
  {
    title: 'Your data stays yours',
    body:  'NavHub uses API access to AI models. Your data is never used to train any model. That\'s guaranteed by the API licensing terms.',
  },
  {
    title: 'Everything in one place',
    body:  'All outputs, documents, and history live in NavHub — not scattered across AI platforms, email threads, or shared drives.',
  },
]

const STORY_STEPS = [
  'Open the NavHub Assistant',
  '"I need HR documents for a new sales hire"',
  'Assistant guides you to set up an HR agent — give them a name, a personality ("experienced HR manager, plain English, no corporate jargon"), and the tools they need',
  'Draft a brief with the Assistant\'s help',
  'Agent runs, asks a couple of clarifying questions, produces the documents',
  'Documents saved to NavHub and synced to your company SharePoint',
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MarketingHomepage() {
  return (
    <>
      {/* ── Section 1: Hero ─────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex flex-col items-center justify-center text-center px-4 sm:px-6 pt-24 pb-20 overflow-hidden">
        <HeroBackground />

        <div className="relative z-10 max-w-4xl mx-auto space-y-8">
          {/* Label pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-medium font-[family-name:var(--font-dm-mono)] tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
            AI-native · Built for multi-entity groups
          </div>

          {/* Headline */}
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-bold leading-[1.1] tracking-tight text-white"
            style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}
          >
            The AI-native financial platform
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent"> for serious business groups.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            NavHub puts intelligent agents to work on your financials, reporting, and admin tasks —
            so your team focuses on decisions, not data entry.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              href="/demo"
              className="group flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-7 py-3.5 rounded-xl transition-all text-base shadow-lg shadow-sky-500/20 hover:shadow-sky-400/30"
            >
              Request a Demo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="https://app.navhub.co"
              className="flex items-center gap-2 border border-white/15 hover:border-white/30 text-slate-300 hover:text-white font-medium px-7 py-3.5 rounded-xl transition-all text-base"
            >
              Sign in to NavHub
            </Link>
          </div>
        </div>

        {/* Gradient fade into next section */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#080c14] to-transparent" />
      </section>

      {/* ── Section 2: The Problem ───────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-snug">
            Your financials live in Xero.
            <br className="hidden sm:block" />
            Your reports live in Excel.
            <br className="hidden sm:block" />
            Your documents live everywhere else.
          </p>
          <div className="w-12 h-px bg-sky-500/60 mx-auto" />
          <p className="text-xl sm:text-2xl text-sky-300 font-semibold">
            NavHub brings it all together —
            <br />
            and puts AI to work across all of it.
          </p>
        </div>
      </section>

      {/* ── Section 3: Core Capabilities ────────────────────────────────────── */}
      <section id="features" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 space-y-3">
            <p className="text-xs font-medium text-sky-400 tracking-widest uppercase font-[family-name:var(--font-dm-mono)]">
              Core Capabilities
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              One platform. Every workflow.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {CAPABILITIES.map(({ icon, title, body }) => (
              <div
                key={title}
                className="group relative p-6 sm:p-8 rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-white/[0.06] border border-white/[0.07]">
                    {icon}
                  </div>
                  <h3 className="text-base font-semibold text-white">{title}</h3>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 4: How It Works (Example Story) ─────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-b from-transparent via-[#0a101c]/60 to-transparent">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12 space-y-3">
            <p className="text-xs font-medium text-sky-400 tracking-widest uppercase font-[family-name:var(--font-dm-mono)]">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              See it in action.
            </h2>
          </div>

          <div className="relative rounded-2xl border border-white/[0.08] bg-[#0d1626] overflow-hidden">
            {/* Story header */}
            <div className="border-b border-white/[0.07] px-6 sm:px-8 py-5">
              <div className="flex items-center gap-2.5">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                </div>
                <span className="text-xs text-slate-500 font-[family-name:var(--font-dm-mono)]">
                  Example: Your HR Agent
                </span>
              </div>
            </div>

            {/* Story body */}
            <div className="px-6 sm:px-8 py-7 space-y-5">
              <p className="text-slate-300 text-sm leading-relaxed">
                Need an employment contract template, a position description, and an onboarding checklist for a new hire?
              </p>
              <div className="space-y-3">
                {STORY_STEPS.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 flex items-center justify-center h-5 w-5 rounded-full border border-sky-500/40 bg-sky-500/10">
                      <span className="text-[10px] font-bold text-sky-400 font-[family-name:var(--font-dm-mono)]">→</span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-white/[0.07]">
                <p className="text-sm font-semibold text-white">
                  Done. No separate AI tab. No copy-pasting. No lost files.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 5: Trust & Control ──────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 space-y-3">
            <p className="text-xs font-medium text-sky-400 tracking-widest uppercase font-[family-name:var(--font-dm-mono)]">
              Trust &amp; Control
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              You&apos;re always in control.
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto text-base">
              NavHub gives you full visibility and authority over every agent, every action, every output.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TRUST_POINTS.map(({ title, body }) => (
              <div
                key={title}
                className="flex items-start gap-4 p-5 sm:p-6 rounded-xl border border-white/[0.07] bg-white/[0.025]"
              >
                <div className="mt-0.5 shrink-0 h-5 w-5 flex items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
                  <Check className="h-3 w-3 text-emerald-400" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white mb-1">{title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Section 6: Final CTA ─────────────────────────────────────────────── */}
      <section className="py-32 px-4 sm:px-6 relative overflow-hidden">
        {/* Background accent */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(14,165,233,0.08) 0%, transparent 70%)' }}
          />
        </div>

        <div className="relative max-w-2xl mx-auto text-center space-y-7">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
            See NavHub in action.
          </h2>
          <p className="text-slate-400 text-lg">
            Request a demo and we&apos;ll show you how NavHub works for your business.
          </p>
          <Link
            href="/demo"
            className="group inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-8 py-4 rounded-xl transition-all text-base shadow-lg shadow-sky-500/20 hover:shadow-sky-400/30"
          >
            Request a Demo
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>
    </>
  )
}
