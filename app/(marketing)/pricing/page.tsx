import Link from 'next/link'
import { ArrowRight, Check, Sparkles } from 'lucide-react'

export const metadata = {
  title:       'Pricing — NavHub',
  description: 'Simple, transparent plans. Choose the plan that fits your organisation.',
}

interface Tier {
  id:         string
  name:       string
  blurb:      string
  cta:        string
  ctaHref:    string
  badge?:     string
  highlight?: boolean
  intro?:     string
  features:   string[]
}

const TIERS: Tier[] = [
  {
    id:      'starter',
    name:    'Starter',
    blurb:   'For small teams getting started with AI-native workflows.',
    cta:     'Contact us',
    ctaHref: '/contact',
    features: [
      '1 group, up to 3 companies',
      'Up to 5 users',
      'Financial intelligence (Xero integration)',
      'Documents & Reports',
      '3 AI agents',
      'NavHub-managed AI (Anthropic)',
      'Email support',
    ],
  },
  {
    id:        'pro',
    name:      'Pro',
    blurb:     'For growing organisations needing full platform capability.',
    cta:       'Contact us',
    ctaHref:   '/contact',
    badge:     'Most popular',
    highlight: true,
    intro:     'Everything in Starter, plus:',
    features: [
      'Unlimited companies',
      'Unlimited users',
      'Marketing intelligence integrations',
      'SharePoint & document sync',
      'Unlimited AI agents',
      'BYO AI model and provider',
      'Agent scheduling',
      'Priority support',
    ],
  },
  {
    id:      'enterprise',
    name:    'Enterprise',
    blurb:   'For organisations requiring full governance and customisation.',
    cta:     'Request enterprise demo',
    ctaHref: '/demo',
    intro:   'Everything in Pro, plus:',
    features: [
      'Multi-group management',
      'Custom agent training and configuration',
      'Advanced role-based permissions',
      'Full audit logging',
      'Custom integrations (webhooks)',
      'Dedicated onboarding',
      'White-label options available',
      'SLA support',
      'Security review available',
    ],
  },
]

export default function PricingPage() {
  return (
    <main className="pt-24 pb-20 text-white">
      {/* Hero */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto text-center space-y-5 py-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-medium font-[family-name:var(--font-dm-mono)] tracking-wide">
          <Sparkles className="h-3.5 w-3.5" />
          Pricing
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-[3.5rem] font-bold leading-[1.1] tracking-tight text-white">
          Simple, transparent plans
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Choose the plan that fits your organisation. All plans include the core NavHub platform.
        </p>
      </section>

      {/* Tiers */}
      <section className="px-4 sm:px-6 max-w-6xl mx-auto py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TIERS.map(tier => (
            <div
              key={tier.id}
              className={
                'relative rounded-2xl p-7 flex flex-col ' +
                (tier.highlight
                  ? 'border-2 border-sky-500/40 bg-gradient-to-br from-sky-500/10 via-[#0d1626] to-[#0d1626] shadow-lg shadow-sky-500/10'
                  : 'border border-white/[0.08] bg-[#0d1626]')
              }
            >
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-sky-500 text-white text-[10px] font-bold uppercase tracking-wider font-[family-name:var(--font-dm-mono)]">
                  {tier.badge}
                </span>
              )}

              <div className="space-y-3">
                <h3 className="text-2xl font-bold text-white">{tier.name}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{tier.blurb}</p>
              </div>

              <div className="my-6 h-px bg-white/[0.06]" />

              {tier.intro && (
                <p className="text-sm font-semibold text-slate-300 mb-3">{tier.intro}</p>
              )}
              {!tier.intro && (
                <p className="text-sm font-semibold text-slate-300 mb-3">Included:</p>
              )}

              <ul className="space-y-2.5 flex-1">
                {tier.features.map(f => (
                  <li key={f} className="flex gap-2.5 text-sm text-slate-300 leading-relaxed">
                    <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" strokeWidth={2.5} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                <Link
                  href={tier.ctaHref}
                  className={
                    'inline-flex w-full items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all ' +
                    (tier.highlight
                      ? 'bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/20'
                      : 'border border-white/15 hover:border-white/30 text-slate-200 hover:text-white')
                  }
                >
                  {tier.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-500 text-center max-w-3xl mx-auto pt-10 leading-relaxed">
          All plans use your organisation&apos;s own data — hosted securely on Supabase infrastructure.
          AI usage billed on consumption. Contact us for volume pricing.
        </p>
      </section>

      {/* Final CTA */}
      <section className="px-4 sm:px-6 max-w-4xl mx-auto py-16">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0d1626] p-10 text-center space-y-4">
          <h3 className="text-xl sm:text-2xl font-bold text-white">Not sure which plan is right?</h3>
          <p className="text-slate-400 max-w-xl mx-auto">
            We&apos;ll walk you through the platform and recommend the right plan for your organisation.
          </p>
          <div className="pt-2">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold px-6 py-3 rounded-xl transition-all text-sm shadow-lg shadow-sky-500/20"
            >
              Request a demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
