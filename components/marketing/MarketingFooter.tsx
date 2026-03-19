import Link from 'next/link'

const FOOTER_LINKS = [
  { label: 'Demo',     href: '/demo'                  },
  { label: 'Contact',  href: '/contact'               },
  { label: 'Sign in',  href: 'https://app.navhub.co'  },
  { label: 'Privacy',  href: '/privacy'               },
]

export default function MarketingFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#080c14]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">

        {/* Wordmark */}
        <Link href="/" className="text-lg font-bold font-[family-name:var(--font-dm-sans)]">
          <span className="text-sky-400">nav</span>
          <span className="text-white/40">hub</span>
        </Link>

        {/* Links */}
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {FOOTER_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Copyright */}
        <p className="text-xs text-slate-600">
          © 2026 NavHub. Built for business groups.
        </p>
      </div>
    </footer>
  )
}
