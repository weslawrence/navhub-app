'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'

const NAV_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'Demo',     href: '/demo'       },
  { label: 'Contact',  href: '/contact'    },
]

export default function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#080c14]/90 backdrop-blur-md border-b border-white/[0.06]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-0.5 text-xl font-bold shrink-0 font-[family-name:var(--font-dm-sans)]">
          <span className="text-sky-400">nav</span>
          <span className="text-white/50">hub</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-1 text-sm">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="px-4 py-2 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="https://app.navhub.co"
            className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5"
          >
            Sign in
          </Link>
          <Link
            href="/demo"
            className="text-sm bg-sky-500 hover:bg-sky-400 text-white font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Request a Demo
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-slate-400 hover:text-white p-1"
          onClick={() => setMobileOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/[0.06] bg-[#080c14]">
          <div className="px-4 py-4 space-y-1">
            {NAV_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-2.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors text-sm"
              >
                {label}
              </Link>
            ))}
            <div className="pt-3 mt-3 border-t border-white/[0.06] flex flex-col gap-2">
              <Link
                href="https://app.navhub.co"
                className="block px-4 py-2.5 text-sm text-slate-400 hover:text-white transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                Sign in →
              </Link>
              <Link
                href="/demo"
                onClick={() => setMobileOpen(false)}
                className="block text-center text-sm bg-sky-500 hover:bg-sky-400 text-white font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                Request a Demo
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
