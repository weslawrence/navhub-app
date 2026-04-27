import Link from 'next/link'

const FOOTER_GROUPS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Features',   href: '/#features'  },
      { label: 'Security',   href: '/security'   },
      { label: 'Enterprise', href: '/enterprise' },
      { label: 'Pricing',    href: '/pricing'    },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Contact', href: '/contact' },
      { label: 'Demo',    href: '/demo'    },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy',   href: '/privacy' },
      { label: 'Terms of Service', href: '/terms'   },
    ],
  },
]

export default function MarketingFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#080c14]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-1 sm:grid-cols-4 gap-10">

        {/* Wordmark + tagline */}
        <div className="space-y-3 sm:col-span-1">
          <Link href="/" className="text-lg font-bold font-[family-name:var(--font-dm-sans)]">
            <span className="text-sky-400">nav</span>
            <span className="text-white/40">hub</span>
          </Link>
          <p className="text-xs text-slate-500 leading-relaxed max-w-[200px]">
            AI-native intelligence for your business — governed, audited and contained.
          </p>
        </div>

        {/* Link groups */}
        {FOOTER_GROUPS.map(group => (
          <div key={group.heading} className="space-y-3">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-[family-name:var(--font-dm-mono)]">
              {group.heading}
            </p>
            <ul className="space-y-2">
              {group.links.map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-600">
            © 2026 NavHub. All rights reserved.
          </p>
          <Link
            href="https://app.navhub.co"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Sign in →
          </Link>
        </div>
      </div>
    </footer>
  )
}
