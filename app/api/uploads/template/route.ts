import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

// ─── Template definitions ────────────────────────────────────────────────────

interface TemplateRow {
  Category:    string
  Subcategory: string
  'Line Item':  string
  Amount:       string
}

interface TBRow {
  'Account Code': string
  'Account Name': string
  Debit:          string
  Credit:         string
}

const PL_ROWS: TemplateRow[] = [
  { Category: 'Revenue',                    Subcategory: '',                     'Line Item': 'Sales',                  Amount: '' },
  { Category: 'Revenue',                    Subcategory: '',                     'Line Item': 'Other Income',           Amount: '' },
  { Category: 'Cost of Sales',              Subcategory: '',                     'Line Item': 'Direct Costs',           Amount: '' },
  { Category: 'Cost of Sales',              Subcategory: '',                     'Line Item': 'Cost of Goods Sold',     Amount: '' },
  { Category: 'Gross Profit',               Subcategory: '',                     'Line Item': 'Gross Profit',           Amount: '' },
  { Category: 'Operating Expenses',         Subcategory: 'Employee Costs',       'Line Item': 'Wages & Salaries',       Amount: '' },
  { Category: 'Operating Expenses',         Subcategory: 'Employee Costs',       'Line Item': 'Superannuation',         Amount: '' },
  { Category: 'Operating Expenses',         Subcategory: 'Office & Admin',       'Line Item': 'Rent',                   Amount: '' },
  { Category: 'Operating Expenses',         Subcategory: 'Office & Admin',       'Line Item': 'Utilities',              Amount: '' },
  { Category: 'Operating Expenses',         Subcategory: 'Office & Admin',       'Line Item': 'Office Supplies',        Amount: '' },
  { Category: 'Operating Expenses',         Subcategory: 'Sales & Marketing',    'Line Item': 'Advertising',            Amount: '' },
  { Category: 'Operating Expenses',         Subcategory: 'IT & Systems',         'Line Item': 'Software Subscriptions', Amount: '' },
  { Category: 'Operating Expenses',         Subcategory: 'Professional Fees',    'Line Item': 'Accounting',             Amount: '' },
  { Category: 'Operating Expenses',         Subcategory: 'Professional Fees',    'Line Item': 'Legal',                  Amount: '' },
  { Category: 'EBITDA',                     Subcategory: '',                     'Line Item': 'EBITDA',                 Amount: '' },
  { Category: 'Depreciation & Amortisation',Subcategory: '',                     'Line Item': 'Depreciation',           Amount: '' },
  { Category: 'Depreciation & Amortisation',Subcategory: '',                     'Line Item': 'Amortisation',           Amount: '' },
  { Category: 'EBIT',                       Subcategory: '',                     'Line Item': 'EBIT',                   Amount: '' },
  { Category: 'Interest',                   Subcategory: '',                     'Line Item': 'Interest Expense',       Amount: '' },
  { Category: 'Tax',                        Subcategory: '',                     'Line Item': 'Income Tax',             Amount: '' },
  { Category: 'Net Profit',                 Subcategory: '',                     'Line Item': 'Net Profit / (Loss)',    Amount: '' },
]

const BS_ROWS: TemplateRow[] = [
  { Category: 'Current Assets',        Subcategory: 'Cash',            'Line Item': 'Bank Accounts',          Amount: '' },
  { Category: 'Current Assets',        Subcategory: 'Receivables',     'Line Item': 'Trade Debtors',          Amount: '' },
  { Category: 'Current Assets',        Subcategory: 'Receivables',     'Line Item': 'Other Receivables',      Amount: '' },
  { Category: 'Current Assets',        Subcategory: 'Inventory',       'Line Item': 'Stock on Hand',          Amount: '' },
  { Category: 'Non-Current Assets',    Subcategory: 'Fixed Assets',    'Line Item': 'Property, Plant & Equip', Amount: '' },
  { Category: 'Non-Current Assets',    Subcategory: 'Fixed Assets',    'Line Item': 'Less: Depreciation',     Amount: '' },
  { Category: 'Non-Current Assets',    Subcategory: 'Intangibles',     'Line Item': 'Goodwill',               Amount: '' },
  { Category: 'Total Assets',          Subcategory: '',                'Line Item': 'Total Assets',           Amount: '' },
  { Category: 'Current Liabilities',   Subcategory: 'Payables',        'Line Item': 'Trade Creditors',        Amount: '' },
  { Category: 'Current Liabilities',   Subcategory: 'Payables',        'Line Item': 'GST Payable',            Amount: '' },
  { Category: 'Current Liabilities',   Subcategory: 'Accruals',        'Line Item': 'Accrued Expenses',       Amount: '' },
  { Category: 'Non-Current Liabilities',Subcategory: 'Borrowings',     'Line Item': 'Long-term Loans',        Amount: '' },
  { Category: 'Total Liabilities',     Subcategory: '',                'Line Item': 'Total Liabilities',      Amount: '' },
  { Category: 'Net Assets',            Subcategory: '',                'Line Item': 'Net Assets',             Amount: '' },
  { Category: 'Equity',                Subcategory: 'Share Capital',   'Line Item': 'Issued Capital',         Amount: '' },
  { Category: 'Equity',                Subcategory: 'Retained Earnings','Line Item': 'Retained Earnings',     Amount: '' },
  { Category: 'Equity',                Subcategory: 'Retained Earnings','Line Item': 'Current Year Profit',   Amount: '' },
]

// ─── GET /api/uploads/template?type=pl|bs|tb ──────────────────────────────────

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  if (!type || !['pl', 'bs', 'tb'].includes(type)) {
    return NextResponse.json({ error: 'type must be pl, bs, or tb' }, { status: 400 })
  }

  const wb   = XLSX.utils.book_new()
  let filename = ''

  if (type === 'tb') {
    // Trial Balance — blank template with headers only
    const tbSheet = XLSX.utils.json_to_sheet([] as TBRow[], {
      header: ['Account Code', 'Account Name', 'Debit', 'Credit'],
    })
    // Set column widths
    tbSheet['!cols'] = [{ wch: 14 }, { wch: 36 }, { wch: 14 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, tbSheet, 'Trial Balance')
    filename = 'navhub-trial-balance-template.xlsx'
  } else {
    const rows     = type === 'pl' ? PL_ROWS : BS_ROWS
    const sheetName = type === 'pl' ? 'Profit & Loss' : 'Balance Sheet'
    const ws        = XLSX.utils.json_to_sheet(rows as TemplateRow[], {
      header: ['Category', 'Subcategory', 'Line Item', 'Amount'],
    })
    ws['!cols'] = [{ wch: 30 }, { wch: 22 }, { wch: 30 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    filename = type === 'pl'
      ? 'navhub-profit-loss-template.xlsx'
      : 'navhub-balance-sheet-template.xlsx'
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const uint8  = new Uint8Array(buffer)

  return new Response(uint8, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
