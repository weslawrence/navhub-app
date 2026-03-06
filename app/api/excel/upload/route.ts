import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EntityType, ReportType, FinancialRow } from '@/lib/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]

// Sheet name → report_type mapping
const SHEET_MAP: Record<string, ReportType> = {
  'P&L':           'profit_loss',
  'Profit & Loss': 'profit_loss',
  'ProfitAndLoss': 'profit_loss',
  'Balance Sheet': 'balance_sheet',
  'BalanceSheet':  'balance_sheet',
  'Cashflow':      'cashflow',
  'Cash Flow':     'cashflow',
  'CashFlow':      'cashflow',
}

export async function POST(request: NextRequest) {
  const supabase = createClient()

  // ── Auth ──────────────────────────────────────────────────
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // ── Parse FormData ────────────────────────────────────────
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file       = formData.get('file') as File | null
  const entityType = formData.get('entity_type') as EntityType | null
  const entityId   = formData.get('entity_id') as string | null

  if (!file || !entityType || !entityId) {
    return NextResponse.json({ error: 'file, entity_type, and entity_id are required.' }, { status: 400 })
  }

  if (!['company', 'division'].includes(entityType)) {
    return NextResponse.json({ error: 'entity_type must be "company" or "division".' }, { status: 400 })
  }

  // ── Validate file ─────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit.' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/i)) {
    return NextResponse.json({ error: 'Only .xlsx and .xls files are allowed.' }, { status: 400 })
  }

  // ── Verify entity access and get group_id ─────────────────
  const admin = createAdminClient()
  let groupId: string

  if (entityType === 'company') {
    const { data: company } = await supabase
      .from('companies')
      .select('id, group_id')
      .eq('id', entityId)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'Company not found or access denied.' }, { status: 404 })
    }
    groupId = company.group_id
  } else {
    const { data: division } = await supabase
      .from('divisions')
      .select('id, company:companies(group_id)')
      .eq('id', entityId)
      .single()

    if (!division) {
      return NextResponse.json({ error: 'Division not found or access denied.' }, { status: 404 })
    }
    const company = Array.isArray(division.company) ? division.company[0] : division.company
    groupId = company.group_id
  }

  // ── Upload file to Supabase Storage ──────────────────────
  const ts          = Date.now()
  const storagePath = `${groupId}/${entityType}/${entityId}/${ts}_${file.name}`
  const fileBuffer  = await file.arrayBuffer()

  const { error: storageError } = await admin.storage
    .from('excel-uploads')
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert:      false,
    })

  if (storageError) {
    return NextResponse.json({ error: `Storage error: ${storageError.message}` }, { status: 500 })
  }

  // ── Create excel_uploads record ───────────────────────────
  const uploadRecord = {
    filename:    file.name,
    storage_path: storagePath,
    uploaded_by:  session.user.id,
    status:       'processing' as const,
    [entityType === 'company' ? 'company_id' : 'division_id']: entityId,
  }

  const { data: uploadRow, error: uploadInsertError } = await admin
    .from('excel_uploads')
    .insert(uploadRecord)
    .select('id')
    .single()

  if (uploadInsertError) {
    // Clean up storage on DB failure
    await admin.storage.from('excel-uploads').remove([storagePath])
    return NextResponse.json({ error: uploadInsertError.message }, { status: 500 })
  }

  // ── Parse Excel workbook ──────────────────────────────────
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' })

  const sheetsFound: string[]  = []
  const periodsFound: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const reportType = SHEET_MAP[sheetName]
    if (!reportType) continue

    sheetsFound.push(sheetName)

    const worksheet = workbook.Sheets[sheetName]
    const rows      = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { header: 1, defval: '' })

    // Try to detect period from the sheet data
    const period = detectPeriod(rows) ?? new Date().toISOString().slice(0, 7)
    if (!periodsFound.includes(period)) periodsFound.push(period)

    // Normalise to FinancialRow[]
    const financialRows = normaliseExcelRows(rows)

    const financialData = {
      period,
      report_type:  reportType,
      currency:     'AUD',
      rows:         financialRows,
      generated_at: new Date().toISOString(),
    }

    // Upsert financial_snapshots
    const snapshotRecord = {
      period,
      report_type: reportType,
      source:      'excel' as const,
      data:        financialData,
      synced_at:   new Date().toISOString(),
      [entityType === 'company' ? 'company_id' : 'division_id']: entityId,
    }

    await admin
      .from('financial_snapshots')
      .upsert(snapshotRecord, {
        onConflict: entityType === 'company'
          ? 'company_id,period,report_type,source'
          : 'division_id,period,report_type,source',
        ignoreDuplicates: false,
      })

    // Write sync log
    await admin.from('sync_logs').insert({
      source:  'excel',
      status:  'success',
      message: `Imported ${sheetName} for ${period}`,
      [entityType === 'company' ? 'company_id' : 'division_id']: entityId,
    })
  }

  // ── Update upload record ──────────────────────────────────
  const finalStatus = sheetsFound.length > 0 ? 'complete' : 'error'
  const errorMsg    = sheetsFound.length === 0
    ? `No recognised sheets found. Expected: ${Object.keys(SHEET_MAP).join(', ')}`
    : null

  await admin
    .from('excel_uploads')
    .update({ status: finalStatus, error_message: errorMsg })
    .eq('id', uploadRow.id)

  if (sheetsFound.length === 0) {
    return NextResponse.json({
      error: errorMsg,
    }, { status: 422 })
  }

  return NextResponse.json({
    data: {
      sheets_found: sheetsFound,
      periods:      periodsFound,
    },
  })
}

// ── Helpers ────────────────────────────────────────────────

/**
 * Try to detect a YYYY-MM period from the first few rows of an Excel sheet.
 * Looks for cells that look like "Jan 2025", "2025-01", etc.
 */
function detectPeriod(rows: Record<string, unknown>[]): string | null {
  const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']

  for (const row of rows.slice(0, 5)) {
    for (const cell of Object.values(row)) {
      const val = String(cell).trim()

      // YYYY-MM format
      if (/^\d{4}-\d{2}$/.test(val)) return val

      // "Month YYYY" format (e.g. "January 2025" or "Jan 2025")
      const match = val.match(/^([a-zA-Z]{3,})\s+(\d{4})$/)
      if (match) {
        const monthIdx = monthNames.indexOf(match[1].toLowerCase().slice(0, 3))
        if (monthIdx !== -1) {
          return `${match[2]}-${String(monthIdx + 1).padStart(2, '0')}`
        }
      }
    }
  }

  return null
}

/**
 * Convert a 2D array of Excel rows into FinancialRow[].
 * Assumes column 0 = account name, column 1 = amount.
 */
function normaliseExcelRows(rows: Record<string, unknown>[]): FinancialRow[] {
  const result: FinancialRow[] = []
  let inSection = false
  let sectionRow: FinancialRow | null = null

  for (const row of rows) {
    const cells     = Object.values(row)
    const name      = String(cells[0] ?? '').trim()
    const amountStr = String(cells[1] ?? '').replace(/,/g, '').trim()
    const amount    = parseFloat(amountStr)

    if (!name) continue

    const amountCents = isNaN(amount) ? null : Math.round(amount * 100)

    // Detect section headers (no amount and title-case or all-caps)
    const isSectionHeader = amountCents === null && name.length > 2
    const isSummary       = name.toLowerCase().includes('total') || name.toLowerCase().includes('net')

    const financialRow: FinancialRow = {
      account_name:  name,
      row_type:      isSummary ? 'summaryRow' : isSectionHeader ? 'section' : 'row',
      amount_cents:  amountCents,
    }

    if (isSectionHeader) {
      sectionRow = { ...financialRow, children: [] }
      result.push(sectionRow)
      inSection = true
    } else if (inSection && sectionRow && !isSummary) {
      sectionRow.children!.push(financialRow)
    } else {
      result.push(financialRow)
      if (isSummary) {
        inSection = false
        sectionRow = null
      }
    }
  }

  return result
}
