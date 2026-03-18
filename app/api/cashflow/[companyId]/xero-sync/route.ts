import { NextResponse }      from 'next/server'
import { cookies }           from 'next/headers'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getValidToken,
  getOutstandingInvoices,
  getBankAccounts,
  getBankBalance,
  parseXeroDate,
} from '@/lib/xero'

// ─── GET /api/cashflow/[companyId]/xero-sync ─────────────────────────────────
// Returns Xero connection status + bank account list for the company/division.

export async function GET(
  _request: Request,
  { params }: { params: { companyId: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Verify company belongs to active group
  const { data: company } = await supabase
    .from('companies')
    .select('id, group_id')
    .eq('id', params.companyId)
    .eq('group_id', activeGroupId ?? '')
    .single()

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const admin = createAdminClient()

  // Find Xero connection for this company (or its divisions)
  const { data: divisions } = await admin
    .from('divisions')
    .select('id')
    .eq('company_id', params.companyId)

  const divisionIds = (divisions ?? []).map(d => d.id)

  const { data: connections } = await admin
    .from('xero_connections')
    .select('id, entity_type, entity_id, last_synced_at')
    .or([
      `entity_id.eq.${params.companyId}`,
      ...(divisionIds.length ? [`entity_id.in.(${divisionIds.join(',')})`] : []),
    ].join(','))
    .order('last_synced_at', { ascending: false })

  if (!connections || connections.length === 0) {
    return NextResponse.json({ data: { connected: false } })
  }

  const connection = connections[0]

  // Try to fetch bank accounts
  try {
    const { access_token, xero_tenant_id } = await getValidToken(connection.id)
    const bankAccounts = await getBankAccounts(access_token, xero_tenant_id)

    // Fetch current settings so we can show which account is selected
    const { data: settings } = await admin
      .from('cashflow_settings')
      .select('bank_account_id')
      .eq('company_id', params.companyId)
      .single()

    return NextResponse.json({
      data: {
        connected:          true,
        connection_id:      connection.id,
        last_synced_at:     connection.last_synced_at,
        bank_accounts:      bankAccounts.map(b => ({ id: b.AccountID, name: b.Name, code: b.Code })),
        bank_account_id:    settings?.bank_account_id ?? null,
      },
    })
  } catch (err) {
    console.error('[xero-sync GET]', err)
    return NextResponse.json({
      data: {
        connected:      true,
        connection_id:  connection.id,
        last_synced_at: connection.last_synced_at,
        bank_accounts:  [],
        bank_account_id: null,
        error:          'Failed to fetch bank accounts — token may need refresh',
      },
    })
  }
}

// ─── POST /api/cashflow/[companyId]/xero-sync ────────────────────────────────
// Fetches outstanding AR/AP invoices from Xero, upserts into cashflow_xero_items,
// optionally syncs opening balance from a bank account.
// Body (optional): { bank_account_id?: string, sync_balance?: boolean }

export async function POST(
  request: Request,
  { params }: { params: { companyId: string } }
) {
  const supabase      = createClient()
  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Verify company
  const { data: company } = await supabase
    .from('companies')
    .select('id, group_id')
    .eq('id', params.companyId)
    .eq('group_id', activeGroupId ?? '')
    .single()

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  let body: { bank_account_id?: string; sync_balance?: boolean } = {}
  try { body = await request.json() } catch { /* no body is fine */ }

  const admin = createAdminClient()

  // Find Xero connection
  const { data: divisions } = await admin
    .from('divisions')
    .select('id')
    .eq('company_id', params.companyId)
  const divisionIds = (divisions ?? []).map(d => d.id)

  const { data: connections } = await admin
    .from('xero_connections')
    .select('id')
    .or([
      `entity_id.eq.${params.companyId}`,
      ...(divisionIds.length ? [`entity_id.in.(${divisionIds.join(',')})`] : []),
    ].join(','))
    .limit(1)

  if (!connections || connections.length === 0) {
    return NextResponse.json({ error: 'No Xero connection found for this company' }, { status: 404 })
  }

  const connectionId = connections[0].id

  try {
    const { access_token, xero_tenant_id } = await getValidToken(connectionId)

    // Fetch AR and AP invoices in parallel
    const [arInvoices, apInvoices] = await Promise.all([
      getOutstandingInvoices(access_token, xero_tenant_id, 'ACCREC'),
      getOutstandingInvoices(access_token, xero_tenant_id, 'ACCPAY'),
    ])

    const now = new Date().toISOString()

    // Build upsert rows for AR (inflow) invoices
    // Preserve 'overridden' and 'excluded' status for existing rows
    const { data: existingItems } = await admin
      .from('cashflow_xero_items')
      .select('xero_invoice_id, sync_status, overridden_week, overridden_amount')
      .eq('company_id', params.companyId)

    const existingMap = new Map(
      (existingItems ?? []).map(e => [e.xero_invoice_id, e])
    )

    const upsertRows = [
      ...arInvoices.map(inv => buildUpsertRow(inv, 'AR', params.companyId, existingMap, now)),
      ...apInvoices.map(inv => buildUpsertRow(inv, 'AP', params.companyId, existingMap, now)),
    ]

    if (upsertRows.length > 0) {
      const { error: upsertErr } = await admin
        .from('cashflow_xero_items')
        .upsert(upsertRows, { onConflict: 'company_id,xero_invoice_id' })

      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 500 })
      }
    }

    // Optionally sync bank balance as opening balance
    let newBalance: number | null = null
    if (body.sync_balance && body.bank_account_id) {
      newBalance = await getBankBalance(access_token, xero_tenant_id, body.bank_account_id)

      if (newBalance !== null) {
        await admin
          .from('cashflow_settings')
          .upsert(
            {
              company_id:            params.companyId,
              bank_account_id:       body.bank_account_id,
              opening_balance_cents: newBalance,
            },
            { onConflict: 'company_id' }
          )
      }
    }

    // Update last_synced_at on the connection
    void admin
      .from('xero_connections')
      .update({ last_synced_at: now })
      .eq('id', connectionId)

    return NextResponse.json({
      data: {
        ar_count:    arInvoices.length,
        ap_count:    apInvoices.length,
        new_balance: newBalance,
        synced_at:   now,
      },
    })
  } catch (err) {
    console.error('[xero-sync POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Xero sync failed' },
      { status: 500 }
    )
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function buildUpsertRow(
  inv:         { InvoiceID: string; Contact: { Name: string }; DueDate: string; AmountDue: number; Type: string },
  invoiceType: 'AR' | 'AP',
  companyId:   string,
  existing:    Map<string, { sync_status: string; overridden_week: string | null; overridden_amount: number | null }>,
  now:         string
) {
  const ex          = existing.get(inv.InvoiceID)
  const syncStatus  = (ex?.sync_status === 'overridden' || ex?.sync_status === 'excluded')
    ? ex.sync_status
    : 'synced'

  return {
    company_id:         companyId,
    xero_invoice_id:    inv.InvoiceID,
    xero_contact_name:  inv.Contact?.Name ?? null,
    xero_due_date:      parseXeroDate(inv.DueDate),
    xero_amount_due:    Math.round((inv.AmountDue ?? 0) * 100),
    invoice_type:       invoiceType,
    sync_status:        syncStatus,
    overridden_week:    ex?.overridden_week   ?? null,
    overridden_amount:  ex?.overridden_amount ?? null,
    last_synced_at:     now,
    // Legacy columns for backwards compat
    section:            invoiceType === 'AR' ? 'inflow' : 'payable',
    is_overridden:      syncStatus === 'overridden',
  }
}
