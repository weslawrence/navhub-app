import { notFound }    from 'next/navigation'
import { cookies }     from 'next/headers'
import Link            from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Building2, Layers, Plug, Plus, Pencil } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge }       from '@/components/ui/badge'
import { Button }      from '@/components/ui/button'
import { Separator }   from '@/components/ui/separator'
import type { Company, Division } from '@/lib/types'

type Params = { params: { id: string } }

export default async function CompanyDetailPage({ params }: Params) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: company } = await supabase
    .from('companies')
    .select('*, divisions(*)')
    .eq('id', params.id)
    .eq('group_id', activeGroupId ?? '')
    .single()

  if (!company) notFound()

  const divisions: Division[] = company.divisions ?? []

  // Xero connections for this company
  const { data: connections } = await supabase
    .from('xero_connections')
    .select('id, xero_tenant_name, is_active, updated_at')
    .eq('company_id', params.id)

  const typedCompany = company as Company & { divisions: Division[] }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground flex items-center gap-1.5">
        <Link href="/companies" className="hover:text-foreground transition-colors">Companies</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{typedCompany.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary mt-0.5">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{typedCompany.name}</h1>
              <Badge variant={typedCompany.is_active ? 'default' : 'secondary'}>
                {typedCompany.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              {typedCompany.industry ?? 'No industry set'}{' · '}
              <span className="font-mono text-xs">{typedCompany.slug}</span>
            </p>
            {typedCompany.description && (
              <p className="text-sm mt-2 text-muted-foreground">{typedCompany.description}</p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/companies/${params.id}/edit`}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Link>
        </Button>
      </div>

      <Separator />

      {/* Divisions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Divisions
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Departments or business units within this company
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/companies/${params.id}/divisions/new`}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Division
            </Link>
          </Button>
        </div>

        {divisions.length > 0 ? (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Industry</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {divisions.map((div: Division) => (
                  <tr key={div.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/companies/${params.id}/divisions/${div.id}`}
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {div.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{div.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {div.industry ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={div.is_active ? 'default' : 'secondary'}>
                        {div.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                          <Link href={`/companies/${params.id}/divisions/${div.id}/edit`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Layers className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No divisions yet</p>
              <Button size="sm" variant="outline" asChild className="mt-3">
                <Link href={`/companies/${params.id}/divisions/new`}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Division
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      <Separator />

      {/* Xero Integration */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Plug className="h-4 w-4 text-muted-foreground" />
              Xero Integration
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connect this company to a Xero organisation to sync financial data
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/api/xero/connect?entity_type=company&entity_id=${params.id}`}>
              <Plug className="h-3.5 w-3.5 mr-1.5" />
              Connect Xero
            </Link>
          </Button>
        </div>

        {connections && connections.length > 0 ? (
          <div className="space-y-2">
            {connections.map((conn: { id: string; xero_tenant_name: string | null; is_active: boolean; updated_at: string }) => (
              <Card key={conn.id}>
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{conn.xero_tenant_name ?? 'Unknown organisation'}</CardTitle>
                    <Badge variant={conn.is_active ? 'default' : 'secondary'}>
                      {conn.is_active ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    Last synced {new Date(conn.updated_at).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center h-28 text-muted-foreground">
              <Plug className="h-7 w-7 mb-2 opacity-30" />
              <p className="text-sm">No Xero connection</p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
