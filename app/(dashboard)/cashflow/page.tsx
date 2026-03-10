'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, ChevronRight, TrendingUp, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Company } from '@/lib/types'

// ─── Cash Flow — Company Selector ────────────────────────────────────────────

export default function CashflowIndexPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/companies')
      .then(r => r.json())
      .then(j => {
        if (j.error) throw new Error(j.error)
        setCompanies((j.data ?? []).filter((c: Company) => c.is_active))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cash Flow Forecast</h1>
        <p className="text-muted-foreground mt-1">
          Select a company to view or edit its 13-week rolling cash flow forecast.
        </p>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {!loading && !error && companies.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No active companies found. Add a company in{' '}
            <Link href="/settings?tab=companies" className="underline text-foreground">
              Settings
            </Link>
            .
          </CardContent>
        </Card>
      )}

      {!loading && companies.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map(company => (
            <Link key={company.id} href={`/cashflow/${company.id}`}>
              <Card className="h-full cursor-pointer hover:border-primary/50 hover:shadow-md transition-all">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: 'var(--palette-primary)', opacity: 0.15 }}
                    />
                    <Building2
                      className="w-5 h-5 absolute"
                      style={{ color: 'var(--palette-primary)', marginTop: '8px', marginLeft: '8px' }}
                    />
                    <ChevronRight className="h-5 w-5 text-muted-foreground mt-1" />
                  </div>
                  <CardTitle className="text-base mt-2 text-foreground">{company.name}</CardTitle>
                  {company.industry && (
                    <CardDescription>{company.industry}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">13-week forecast</span>
                    <Badge variant="outline" className="text-xs ml-auto">Manual</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Group Summary Link */}
      {!loading && companies.length > 1 && (
        <div className="pt-2">
          <Link
            href="/cashflow/group"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <TrendingUp className="h-4 w-4" />
            View group cash flow summary
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
