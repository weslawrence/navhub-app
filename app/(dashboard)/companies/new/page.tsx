'use client'

import { useState }      from 'react'
import { useRouter }     from 'next/navigation'
import Link              from 'next/link'
import { ArrowLeft }     from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button }        from '@/components/ui/button'
import { CompanyForm, type CompanyFormValues } from '@/components/companies/CompanyForm'

export default function NewCompanyPage() {
  const router           = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(values: CompanyFormValues) {
    setIsLoading(true)
    try {
      const res  = await fetch('/api/companies', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(values),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create company')
      router.push(`/companies/${json.data.id}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href="/companies">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Company</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Add a legal entity or brand to your group
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company details</CardTitle>
          <CardDescription>
            A URL-safe slug will be generated from the name automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            submitLabel="Create Company"
          />
        </CardContent>
      </Card>
    </div>
  )
}
