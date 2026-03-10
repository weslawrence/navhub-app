import Link from 'next/link'
import { TrendingUp, ChevronLeft } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// ─── Group Cash Flow Summary — Phase 4b placeholder ──────────────────────────

export default function GroupCashflowPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/cashflow" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Group Cash Flow</h1>
          <p className="text-xs text-muted-foreground">Consolidated view across all companies</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 mb-2">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-base">Coming in Phase 4b</CardTitle>
          <CardDescription>
            The group cash flow summary will consolidate 13-week forecasts across all companies,
            showing combined inflows, outflows, and closing balance projections.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            In the meantime, view individual company forecasts from the{' '}
            <Link href="/cashflow" className="underline text-foreground">
              Cash Flow overview
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
