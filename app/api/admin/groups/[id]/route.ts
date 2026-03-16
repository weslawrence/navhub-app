import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function verifySuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('user_groups')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
  return (data?.length ?? 0) > 0
}

// ─── GET /api/admin/groups/[id] ───────────────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!await verifySuperAdmin(session.user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin    = createAdminClient()
  const groupId  = params.id

  const { data: group } = await admin
    .from('groups')
    .select('id, name, slug, palette_id, created_at')
    .eq('id', groupId)
    .single()

  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  // Companies with division counts and Xero status
  const { data: companies } = await admin
    .from('companies')
    .select('id, name, is_active')
    .eq('group_id', groupId)
    .order('name')

  const companyIds = (companies ?? []).map((c: { id: string }) => c.id)

  const [{ data: divisions }, { data: xeroConns }, { data: syncLogs }] = await Promise.all([
    admin.from('divisions').select('company_id').in('company_id', companyIds.length > 0 ? companyIds : ['x']),
    admin.from('xero_connections').select('company_id').in('company_id', companyIds.length > 0 ? companyIds : ['x']),
    admin.from('sync_logs')
      .select('company_id, created_at')
      .in('company_id', companyIds.length > 0 ? companyIds : ['x'])
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  const divCountByCompany: Record<string, number> = {}
  for (const d of (divisions ?? []) as Array<{ company_id: string }>) {
    divCountByCompany[d.company_id] = (divCountByCompany[d.company_id] ?? 0) + 1
  }

  const xeroCompanyIds = new Set((xeroConns ?? []).map((x: { company_id: string }) => x.company_id))

  const lastSyncByCompany: Record<string, string> = {}
  for (const s of (syncLogs ?? []) as Array<{ company_id: string; created_at: string }>) {
    if (!lastSyncByCompany[s.company_id]) lastSyncByCompany[s.company_id] = s.created_at
  }

  const companiesData = (companies ?? []).map((c: { id: string; name: string; is_active: boolean }) => ({
    id:              c.id,
    name:            c.name,
    is_active:       c.is_active,
    division_count:  divCountByCompany[c.id]  ?? 0,
    has_xero:        xeroCompanyIds.has(c.id),
    last_synced_at:  lastSyncByCompany[c.id]  ?? null,
  }))

  // Storage usage — count objects in excel-uploads and report-files for this group prefix
  const storageFiles: { bucket: string; count: number }[] = []
  for (const bucket of ['excel-uploads', 'report-files', 'documents']) {
    try {
      const { data: files } = await admin.storage.from(bucket).list(groupId, { limit: 1000 })
      storageFiles.push({ bucket, count: files?.length ?? 0 })
    } catch {
      storageFiles.push({ bucket, count: 0 })
    }
  }

  return NextResponse.json({
    data: {
      group,
      companies: companiesData,
      storage_files: storageFiles,
    },
  })
}
