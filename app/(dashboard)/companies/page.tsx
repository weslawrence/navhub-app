'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Building2, Plus, Layers, Pencil, ChevronRight } from 'lucide-react'
import { Button }    from '@/components/ui/button'
import { Badge }     from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ToggleSwitch } from '@/components/ui/toggle-switch'

interface CompanyRow {
  id:             string
  name:           string
  slug:           string
  industry:       string | null
  is_active:      boolean
  division_count: number
  created_at:     string
}

export default function CompaniesPage() {
  const [companies,       setCompanies]       = useState<CompanyRow[]>([])
  const [showInactive,    setShowInactive]    = useState(false)
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState<string | null>(null)

  const fetchCompanies = useCallback(async (includeInactive: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/companies?include_inactive=${includeInactive}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load companies')
      setCompanies(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load companies')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchCompanies(showInactive) }, [fetchCompanies, showInactive])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Legal entities and brands within your group
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/companies/new">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Company
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <ToggleSwitch
          checked={showInactive}
          onCheckedChange={setShowInactive}
          label="Show inactive"
        />
      </div>

      {/* Error */}
      {error && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && !error && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {/* Table */}
      {!loading && !error && companies.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Industry</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Divisions</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {companies.map(company => (
                <tr
                  key={company.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/companies/${company.id}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {company.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{company.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {company.industry ?? '—'}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Layers className="h-3.5 w-3.5" />
                      {company.division_count}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={company.is_active ? 'default' : 'secondary'}>
                      {company.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <Link href={`/companies/${company.id}/edit`} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                        <Link href={`/companies/${company.id}`} title="View">
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && companies.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Building2 className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium text-sm">
              {showInactive ? 'No companies found' : 'No active companies'}
            </p>
            <p className="text-xs mt-1">
              {showInactive
                ? 'Add your first company to get started'
                : 'Try enabling "Show inactive" or add a new company'}
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/companies/new">
                <Plus className="h-4 w-4 mr-1.5" />
                Add Company
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
