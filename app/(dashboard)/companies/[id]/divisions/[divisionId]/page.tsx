import { notFound }     from 'next/navigation'
import { cookies }      from 'next/headers'
import Link             from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Layers, Plug, Plus, Pencil } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge }        from '@/components/ui/badge'
import { Button }       from '@/components/ui/button'
import { Separator }    from '@/components/ui/separator'
import type { Division } from '@/lib/types'

type Params = { params: { id: string; divisionId: string } }

export default async function DivisionDetailPage({ params }: Params) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  // Fetch division with parent company (verify group ownership)
  const { data: division } = await supabase
    .from('divisions')
    .select('*, companies!inner(id, name, group_id, slug)')
    .eq('id', params.divisionId)
    .eq('company_id', params.id)
    .eq('companies.group_id', activeGroupId ?? '')
    .single()

  if (!division) notFound()

  const typedDivision = division as Division & {
    companies: { id: string; name: string; group_id: string; slug: string }
  }

  // Xero connections for this division
  const { data: connections } = await supabase
    .from('xero_connections')
    .select('id, xero_tenant_name, is_active, updated_at')
    .eq('division_id', params.divisionId)

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
        <Link href="/companies" className="hover:text-foreground transition-colors">Companies</Link>
        <span>/</span>
        <Link
          href={`/companies/${params.id}`}
          className="hover:text-foreground transition-colors"
        >
          {typedDivision.companies.name}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{typedDivision.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary mt-0.5">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{typedDivision.name}</h1>
              <Badge variant={typedDivision.is_active ? 'default' : 'secondary'}>
                {typedDivision.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              {typedDivision.industry ?? 'No industry set'}{' · '}
              <span className="font-mono text-xs">{typedDivision.slug}</span>
            </p>
            {typedDivision.description && (
              <p className="text-sm mt-2 text-muted-foreground">{typedDivision.description}</p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/companies/${params.id}/divisions/${params.divisionId}/edit`}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Link>
        </Button>
      </div>

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
              Connect this division to a Xero organisation to sync financial data
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/api/xero/connect?entity_type=division&entity_id=${params.divisionId}`}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
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
