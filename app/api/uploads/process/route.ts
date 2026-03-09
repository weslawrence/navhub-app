import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies }           from 'next/headers'
import * as XLSX             from 'xlsx'
import type { FinancialData, FinancialRow } from '@/lib/types'

export const runtime = 'nodejs'

type ReportTypeKey = 'pl' | 'bs' | 'tb'

const REPORT_TYPE_MAP: Record<ReportTypeKey, string> = {
  pl: 'profit_loss',
  bs: 'balance_sheet',
  tb: 'cashflow',  // TB maps to cashflow by convention for now
}

// ─── Parse P&L or Balance Sheet rows ─────────────────────────────────────────

interface TemplateRow {
  Category?:    unknown
  Subcategory?: unknown
  'Line Item'?: unknown
  Amount?:      unknown
}

function parsePLOrBS(rows: TemplateRow[], reportType: ReportTypeKey): FinancialRow[] {
  const financial: FinancialRow[] = []
  let currentSection: FinancialRow | null = null

  for (const row of rows) {
    const category   = String(row['Category']   ?? '').trim()
    const lineItem   = String(row['Line Item']  ?? '').trim()
    const amountRaw  = row['Amount']
    const amountNum  = amountRaw !== undefined && amountRaw !== '' && amountRaw !== null
      ? Math.round(Number(amountRaw) * 100)   // dollars → cents
      : null

    if (!category && !lineItem) continue

    // Section heading (e.g. "Revenue", "Cost of Sales")
    if (category && (!lineItem || lineItem === category)) {
      const sectionRow: FinancialRow = {
        account_name: category,
        row_type:     'section',
        amount_cents: null,
        children:     [],
      }
      financial.push(sectionRow)
      currentSection = sectionRow
      continue
    }

    // Summary row (same as category, special keywords)
    const summaryKeywords = [
      'Gross Profit', 'EBITDA', 'EBIT', 'Net Profit',
      'Total Assets', 'Total Liabilities', 'Net Assets',
    ]
    const isSummary = summaryKeywords.some(
      kw => lineItem.toLowerCase().includes(kw.toLowerCase()) ||
            category.toLowerCase().includes(kw.toLowerCase())
    )

    const dataRow: FinancialRow = {
      account_name: lineItem || category,
      row_type:     isSummary ? 'summaryRow' : 'row',
      amount_cents: isNaN(amountNum as number) ? null : amountNum,
    }

    if (isSummary) {
      // Summary rows go at top level
      currentSection = null
      financial.push(dataRow)
    } else if (currentSection?.children) {
      currentSection.children.push(dataRow)
    } else {
      financial.push(dataRow)
    }
  }

  // Remove empty children arrays
  for (const row of financial) {
    if (row.children?.length === 0) delete row.children
  }

  return financial
}

// ─── Parse Trial Balance ──────────────────────────────────────────────────────

interface TBRow {
  'Account Code'?: unknown
  'Account Name'?: unknown
  Debit?:          unknown
  Credit?:         unknown
}

function parseTB(rows: TBRow[]): FinancialRow[] {
  const financial: FinancialRow[] = []
  for (const row of rows) {
    const code   = String(row['Account Code'] ?? '').trim()
    const name   = String(row['Account Name'] ?? '').trim()
    const debit  = Number(row['Debit']  ?? 0)
    const credit = Number(row['Credit'] ?? 0)

    if (!name) continue

    const netAmount = (isNaN(debit) ? 0 : debit) - (isNaN(credit) ? 0 : credit)
    financial.push({
      account_id:   code || undefined,
      account_name: name,
      row_type:     'row',
      amount_cents: Math.round(netAmount * 100),
    })
  }
  return financial
}

// ─── POST /api/uploads/process ────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const cookieStore   = cookies()
  const activeGroupId = cookieStore.get('active_group_id')?.value
  if (!activeGroupId) {
    return NextResponse.json({ error: 'No active group' }, { status: 400 })
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file         = formData.get('file')         as File | null
  const entityType   = formData.get('entity_type')  as string | null
  const entityId     = formData.get('entity_id')    as string | null
  const reportTypeRaw = formData.get('report_type') as string | null
  const periodValue  = formData.get('period_value') as string | null

  if (!file || !entityType || !entityId || !reportTypeRaw || !periodValue) {
    return NextResponse.json({ error: 'Missing required fields: file, entity_type, entity_id, report_type, period_value' }, { status: 400 })
  }

  const reportType = reportTypeRaw as ReportTypeKey
  if (!['pl', 'bs', 'tb'].includes(reportType)) {
    return NextResponse.json({ error: 'report_type must be pl, bs, or tb' }, { status: 400 })
  }

  // Validate entity belongs to active group
  const admin = createAdminClient()

  if (entityType === 'company') {
    const { data: co } = await supabase
      .from('companies')
      .select('id')
      .eq('id', entityId)
      .eq('group_id', activeGroupId)
      .single()
    if (!co) return NextResponse.json({ error: 'Company not found in this group' }, { status: 404 })
  } else if (entityType === 'division') {
    const { data: div } = await supabase
      .from('divisions')
      .select('id, companies!inner(group_id)')
      .eq('id', entityId)
      .eq('companies.group_id', activeGroupId)
      .single()
    if (!div) return NextResponse.json({ error: 'Division not found in this group' }, { status: 404 })
  } else {
    return NextResponse.json({ error: 'entity_type must be company or division' }, { status: 400 })
  }

  // Parse Excel file
  let rows: FinancialRow[]
  let filename = file.name
  let status: 'processed' | 'error' = 'processed'
  let errorMessage: string | null    = null

  try {
    const arrayBuffer = await file.arrayBuffer()
    const workbook    = XLSX.read(arrayBuffer, { type: 'array' })
    const sheetName   = workbook.SheetNames[0]
    const sheet       = workbook.Sheets[sheetName]
    const jsonRows    = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    if (reportType === 'tb') {
      rows = parseTB(jsonRows as TBRow[])
    } else {
      rows = parsePLOrBS(jsonRows as TemplateRow[], reportType)
    }
  } catch (err) {
    status       = 'error'
    errorMessage = err instanceof Error ? err.message : 'Failed to parse Excel file'
    rows         = []
  }

  // Build FinancialData JSONB
  const financialData: FinancialData = {
    period:       periodValue,
    report_type:  REPORT_TYPE_MAP[reportType] as FinancialData['report_type'],
    currency:     'AUD',
    rows,
    generated_at: new Date().toISOString(),
  }

  // Upsert to financial_snapshots
  if (status === 'processed' && rows.length > 0) {
    const snapshotInsert: Record<string, unknown> = {
      period:      periodValue,
      report_type: REPORT_TYPE_MAP[reportType],
      source:      'excel',
      data:        financialData,
      synced_at:   new Date().toISOString(),
    }
    if (entityType === 'company') {
      snapshotInsert.company_id  = entityId
      snapshotInsert.division_id = null
    } else {
      snapshotInsert.division_id = entityId
      snapshotInsert.company_id  = null
    }

    const conflictKey = entityType === 'company'
      ? 'company_id, division_id, period, report_type'
      : 'company_id, division_id, period, report_type'

    const { error: snapshotErr } = await admin
      .from('financial_snapshots')
      .upsert(snapshotInsert, { onConflict: conflictKey })

    if (snapshotErr) {
      status       = 'error'
      errorMessage = snapshotErr.message
    }
  }

  // Record in excel_uploads
  const uploadRecord: Record<string, unknown> = {
    filename,
    uploaded_by:    session.user.id,
    report_type:    reportType,
    period_value:   periodValue,
    status,
    error_message:  errorMessage,
    column_mapping: null,
    storage_path:   '',  // not storing to Storage in this simplified version
  }
  if (entityType === 'company') {
    uploadRecord.company_id  = entityId
    uploadRecord.division_id = null
  } else {
    uploadRecord.division_id = entityId
    uploadRecord.company_id  = null
  }

  const { data: uploadRow, error: uploadErr } = await admin
    .from('excel_uploads')
    .insert(uploadRecord)
    .select()
    .single()

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  if (status === 'error') {
    return NextResponse.json(
      { data: uploadRow, error: errorMessage },
      { status: 422 }
    )
  }

  return NextResponse.json({ data: uploadRow }, { status: 201 })
}
