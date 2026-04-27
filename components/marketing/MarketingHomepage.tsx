import Link            from 'next/link'
import { DM_Sans, DM_Mono } from 'next/font/google'
import {
  ArrowRight, Shield, Bot, FileText, BarChart2, TrendingUp, Plug,
  Lock, Cpu, KeyRound,
} from 'lucide-react'
import MarketingNav    from '@/components/marketing/MarketingNav'
import MarketingFooter from '@/components/marketing/MarketingFooter'

const dmSans = DM_Sans({
  subsets:  ['latin'],
  variable: '--font-dm-sans',
  weight:   ['400', '500', '600', '700'],
})

const dmMono = DM_Mono({
  subsets:  ['latin'],
  variable: '--font-dm-mono',
  weight:   ['400', '500'],
})

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
        <div className="mesh-blob-1 absolute -top-40 -left-20 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.12) 0%, transparent 70%)' }}
        />
        <div className="mesh-blob-2 absolute -top-20 right-0 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.09) 0%, transparent 70%)' }}
        />
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

// ─── Content blocks ──────────────────────────────────────────────────────────

const HERO_HIGHLIGHTS = [
  {
    icon:  '🔒',
    title: 'Your data stays yours',
    body:  'AI works inside your workspace — never sent to public models or used for training.',
  },
  {
    icon:  '🤖',
    title: 'Agents built for your business',
    body:  "Configure AI agents with your company's knowledge, processes and outputs.",
  },
  {
    icon:  '⚡',
    title: 'BYO model and credentials',
    body:  'Use Anthropic, OpenAI, Google or any provider — with your own API key.',
  },
]

const FEATURES = [
  {
    icon:  <BarChart2 className="h-5 w-5 text-sky-400" />,
    title: 'Financial Intelligence',
    body:  'Real-time P&L, Balance Sheet, cash flow and forecasting across all your entities.',
  },
  {
    icon:  <Bot className="h-5 w-5 text-violet-400" />,
    title: 'AI Agents',
    body:  'Configure, train and deploy AI agents specialised in your business processes.',
  },
  {
    icon:  <FileText className="h-5 w-5 text-emerald-400" />,
    title: 'Documents & Reports',
    body:  'Generate, store, publish and share business documents and financial reports.',
  },
  {
    icon:  <TrendingUp className="h-5 w-5 text-cyan-400" />,
    title: 'Marketing Intelligence',
    body:  'Connect Google Analytics, Meta, LinkedIn and more in one unified view.',
  },
  {
    icon:  <Plug className="h-5 w-5 text-amber-400" />,
    title: 'Integrations',
    body:  'Xero, SharePoint, Google Drive and more — your data ecosystem, connected.',
  },
  {
    icon:  <Shield className="h-5 w-5 text-rose-400" />,
    title: 'Enterprise Controls',
    body:  'Role-based access, feature permissions, audit logs and multi-company governance.',
  },
]

const HOW_IT_WORKS = [
  {
    step:  '01',
    title: 'Connect your data',
    body:  'Link your accounting software, upload financials, or connect your marketing platforms. NavHub pulls everything into a single governed workspace.',
  },
  {
    step:  '02',
    title: 'Configure your agents',
    body:  "Build AI agents with your company's knowledge, documents and processes. Give each agent a specialised role — financial analyst, HR officer, report writer.",
  },
  {
    step:  '03',
    title: 'Work smarter',
    body:  'Brief agents to analyse data, generate reports and create documents. Review, publish and share — human approval always required.',
  },
]

const SAFETY_POINTS = [
  {
    icon:  <Lock className="h-5 w-5 text-emerald-400" />,
    title: 'Your IP stays yours',
    body:  'NavHub brings AI capability to your data — your data never goes to public AI ecosystems. Every interaction stays within your workspace.',
  },
  {
    icon:  <Cpu className="h-5 w-5 text-sky-400" />,
    title: 'Zero training on your data',
    body:  'NavHub uses the Anthropic API exclusively. Your data is never used to train AI models — contractually guaranteed, not just a policy.',
  },
  {
    icon:  <KeyRound className="h-5 w-5 text-violet-400" />,
    title: 'Full audit trail',
    body:  'Every agent action is logged — who ran it, what data was accessed, what was produced. Complete visibility for compliance and governance.',
  },
]

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MarketingHomepage() {
  return (
    <div
      className={`${dmSans.variable} ${dmMono.variable} min-h-screen bg-[#080c14] text-white`}
      style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}
    >
      <MarketingNav />

      <main>
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative min-h-[92vh] flex flex-col items-center justify-center text-center px-4 sm:px-6 pt-24 pb-20 overflow-hidden">
          <HeroBackground />

          <div className="relative z-10 max-w-4xl mx-auto space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-medium font-[family-name:var(--font-dm-mono)] tracking-wide">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
              AI-native · Built for serious businesses
            </div>

            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.25rem] font-bold leading-[1.1] tracking-tight text-white"
              style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}
            >
              AI-native intelligence
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent"> for your business</span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Your data. Your models. Your control.
              <br className="hidden sm:block" />
              NavHub brings frontier AI directly into your business — governed, audited,
              and contained within your workspace.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <Link
                href="/demo"
                className="group flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-7 py-3.5 rounded-xl transition-all text-base shadow-lg shadow-sky-500/20 hover:shadow-sky-400/30"
              >
                Request a demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/#how-it-works"
                className="flex items-center gap-2 border border-white/15 hover:border-white/30 text-slate-300 hover:text-white font-medium px-7 py-3.5 rounded-xl transition-all text-base"
              >
                See how it works
              </Link>
            </div>

            <p className="text-xs text-slate-500 pt-2 font-[family-name:var(--font-dm-mono)] tracking-wide">
              Your data never leaves your workspace · BYO AI model · Full audit trail
            </p>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#080c14] to-transparent" />
        </section>

        {/* ── Hero highlights strip ──────────────────────────────────────── */}
        <section className="py-14 px-4 sm:px-6 border-y border-white/[0.06] bg-[#0a101c]/60">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
            {HERO_HIGHLIGHTS.map(h => (
              <div key={h.title} className="space-y-2">
                <p className="text-2xl">{h.icon}</p>
                <h3 className="text-base font-semibold text-white">{h.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{h.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features grid ──────────────────────────────────────────────── */}
        <section id="features" className="py-24 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-14 space-y-3">
              <p className="text-xs font-medium text-sky-400 tracking-widest uppercase font-[family-name:var(--font-dm-mono)]">
                Platform
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white">
                One platform. Every workflow.
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map(({ icon, title, body }) => (
                <div
                  key={title}
                  className="group relative p-6 rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-300"
                >
                  <div className="flex items-center gap-3 mb-3">
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

        {/* ── How it works ───────────────────────────────────────────────── */}
        <section id="how-it-works" className="py-24 px-4 sm:px-6 bg-gradient-to-b from-transparent via-[#0a101c]/60 to-transparent">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14 space-y-3">
              <p className="text-xs font-medium text-sky-400 tracking-widest uppercase font-[family-name:var(--font-dm-mono)]">
                How it works
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white">
                Bring AI into your business in three steps.
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {HOW_IT_WORKS.map(({ step, title, body }) => (
                <div key={step} className="rounded-2xl border border-white/[0.08] bg-[#0d1626] p-6">
                  <p className="text-xs font-bold text-sky-400 font-[family-name:var(--font-dm-mono)] tracking-widest mb-3">
                    Step {step}
                  </p>
                  <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── AI Safety ──────────────────────────────────────────────────── */}
        <section className="py-24 px-4 sm:px-6 bg-[#060a12] border-y border-white/[0.05]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14 space-y-4 max-w-3xl mx-auto">
              <p className="text-xs font-medium text-sky-400 tracking-widest uppercase font-[family-name:var(--font-dm-mono)]">
                AI Safety
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-white">
                AI that works for you — not the other way around
              </h2>
              <p className="text-slate-400 text-base leading-relaxed">
                Most businesses encounter AI through consumer tools — employees paste sensitive
                data into public chat interfaces with no governance, no audit trail, and no control
                over what happens next. NavHub is different.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {SAFETY_POINTS.map(({ icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 space-y-3"
                >
                  <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-white/[0.06] border border-white/[0.07]">
                    {icon}
                  </div>
                  <h3 className="text-base font-semibold text-white">{title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 text-center">
              <Link
                href="/security"
                className="inline-flex items-center gap-2 text-sky-400 hover:text-sky-300 transition-colors text-sm font-medium"
              >
                Read our security overview
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Enterprise callout ─────────────────────────────────────────── */}
        <section className="py-20 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 via-transparent to-violet-500/5 p-10 sm:p-14 text-center space-y-5">
            <p className="text-xs font-medium text-sky-400 tracking-widest uppercase font-[family-name:var(--font-dm-mono)]">
              For corporate accounts
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Built for corporate accounts
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Set up your organisation with your preferred AI provider and model. Configure agents
              with your processes. Control who sees what. NavHub gives your IT and compliance teams
              the governance they need.
            </p>
            <div className="pt-2">
              <Link
                href="/enterprise"
                className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-7 py-3 rounded-xl transition-all text-sm shadow-lg shadow-sky-500/20"
              >
                Request enterprise demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Testimonial placeholder ────────────────────────────────────── */}
        <section className="py-20 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <p className="text-xl sm:text-2xl text-slate-200 italic leading-relaxed">
              &ldquo;NavHub has changed how we approach financial reporting.
              Our agents now produce board-ready reports in minutes.&rdquo;
            </p>
            <p className="text-sm text-slate-500 font-[family-name:var(--font-dm-mono)]">
              — Coming soon: customer stories
            </p>
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────────── */}
        <section className="py-32 px-4 sm:px-6 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full"
              style={{ background: 'radial-gradient(ellipse, rgba(14,165,233,0.08) 0%, transparent 70%)' }}
            />
          </div>

          <div className="relative max-w-2xl mx-auto text-center space-y-7">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
              Ready to bring AI into your business?
            </h2>
            <p className="text-slate-400 text-lg">
              Join organisations using NavHub to work smarter, move faster and stay in control.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/demo"
                className="group inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-8 py-4 rounded-xl transition-all text-base shadow-lg shadow-sky-500/20 hover:shadow-sky-400/30"
              >
                Request a demo
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 border border-white/15 hover:border-white/30 text-slate-300 hover:text-white font-medium px-8 py-4 rounded-xl transition-all text-base"
              >
                Contact us
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  )
}
