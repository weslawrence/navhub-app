import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Building2, Layers } from 'lucide-react'
import type { Company, Division } from '@/lib/types'

export default async function CompaniesPage() {
  const supabase    = createClient()
  const cookieStore = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  if (!activeGroupId) {
    return (
      <div className="text-muted-foreground text-sm p-4">
        No active group selected.
      </div>
    )
  }

  const { data: companies } = await supabase
    .from('companies')
    .select('*, divisions(*)')
    .eq('group_id', activeGroupId)
    .order('name')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Legal entities and brands within your group
        </p>
      </div>

      {companies && companies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company: Company & { divisions: Division[] }) => (
            <Card key={company.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary shrink-0" />
                    <CardTitle className="text-base">{company.name}</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {company.slug}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {company.divisions && company.divisions.length > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                      <Layers className="h-3 w-3" /> Divisions
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {company.divisions.map((div: Division) => (
                        <Badge key={div.id} variant="secondary" className="text-xs">
                          {div.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No divisions</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Building2 className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No companies yet</p>
            <p className="text-xs mt-1">Contact your group administrator to add companies</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
