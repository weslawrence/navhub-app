'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link  from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button }  from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CompanyForm, type CompanyFormValues } from '@/components/companies/CompanyForm'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { Company } from '@/lib/types'

export default function EditCompanyPage() {
  const router   = useRouter()
  const { id }   = useParams<{ id: string }>()

  const [company,     setCompany]     = useState<Company | null>(null)
  const [loadError,   setLoadError]   = useState<string | null>(null)
  const [isLoading,   setIsLoading]   = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/companies/${id}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) setLoadError(json.error)
        else setCompany(json.data)
      })
      .catch(() => setLoadError('Failed to load company'))
  }, [id])

  async function handleSubmit(values: CompanyFormValues) {
    setIsLoading(true)
    try {
      const res  = await fetch(`/api/companies/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(values),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to update company')
      router.push(`/companies/${id}`)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDeactivate() {
    setDeactivating(true)
    try {
      await fetch(`/api/companies/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_active: false }),
      })
      router.push('/companies')
    } finally {
      setDeactivating(false)
      setConfirmOpen(false)
    }
  }

  if (loadError) {
    return (
      <div className="max-w-xl space-y-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/companies"><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Link>
        </Button>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="max-w-xl space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <Card><CardContent className="h-64 animate-pulse" /></Card>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href={`/companies/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Company</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{company.name}</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company details</CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyForm
            defaultValues={{
              name:        company.name,
              description: company.description ?? '',
              industry:    company.industry    ?? '',
            }}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            submitLabel="Save Changes"
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Danger Zone */}
      {company.is_active && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Deactivating a company hides it from the active list but preserves all
              financial data and integrations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={deactivating}
            >
              {deactivating ? 'Deactivating…' : 'Deactivate Company'}
            </Button>
          </CardContent>
        </Card>
      )}

      {company.is_active && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Deactivate company?"
          description={`"${company.name}" will be hidden from active lists. Financial data is preserved and the company can be reactivated at any time.`}
          confirmLabel="Deactivate"
          onConfirm={handleDeactivate}
          variant="destructive"
        />
      )}
    </div>
  )
}
