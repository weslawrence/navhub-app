import { DM_Sans, DM_Mono } from 'next/font/google'
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

export const metadata = {
  title:       'NavHub — AI-native financial platform',
  description: 'NavHub puts intelligent agents to work on your financials, reporting, and admin tasks.',
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${dmSans.variable} ${dmMono.variable} min-h-screen bg-[#080c14] text-white`}
      style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}
    >
      <MarketingNav />
      <main>
        {children}
      </main>
      <MarketingFooter />
    </div>
  )
}
