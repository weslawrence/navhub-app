'use client'

import { useState }      from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link              from 'next/link'
import { ArrowLeft }     from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button }        from '@/components/ui/button'
import { DivisionForm, type DivisionFormValues } from '@/components/companies/DivisionForm'

export default function NewDivisionPage() {
  const router          = useRouter()
  const { id: companyId } = useParams<{ id: string }>()
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(values: DivisionFormValues) {
    setIsLoading(true)
    try {
      const res  = await fetch('/api/divisions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...values, company_id: companyId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create division')
      router.push(`/companies/${companyId}/divisions/${json.data.id}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href={`/companies/${companyId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Division</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Add a department or business unit to this company
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Division details</CardTitle>
          <CardDescription>
            A URL-safe slug will be generated from the name automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DivisionForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            submitLabel="Create Division"
          />
        </CardContent>
      </Card>
    </div>
  )
}
