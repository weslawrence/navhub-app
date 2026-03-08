// ─── NavHub Financial Data Utilities ─────────────────────────────────────────
//
// Shared helpers for traversing and displaying financial snapshot data
// (the JSONB `data` column in financial_snapshots).

import type { FinancialData, FinancialRow } from './types'

// ============================================================
// Display row types
// ============================================================

export interface DisplayRow {
  account_name: string
  amount_cents: number | null
  row_type:     'section' | 'row' | 'summaryRow'
  indent:       number   // 0 for sections, 1 for rows and summaryRows
}

// ============================================================
// extractRows
// ============================================================

/**
 * Traverses the nested FinancialData rows structure and returns a flat,
 * ordered array of display rows.
 *
 * Summary mode: section headers (row_type 'section' | 'header') + summaryRow items only.
 * Detail mode:  section headers + all individual row items + summaryRow items.
 *
 * Sections are label-only (amount_cents = null, indent = 0).
 * All other items have indent = 1.
 */
export function extractRows(
  data: FinancialData | null,
  mode: 'summary' | 'detail'
): DisplayRow[] {
  if (!data) return []

  const result: DisplayRow[] = []

  function traverse(rows: FinancialRow[]) {
    for (const row of rows) {
      if (row.row_type === 'section' || row.row_type === 'header') {
        // Section / header label — include when it has a non-empty name
        if (row.account_name?.trim()) {
          result.push({
            account_name: row.account_name,
            amount_cents: null,
            row_type:     'section',
            indent:       0,
          })
        }
        if (row.children) traverse(row.children)

      } else if (row.row_type === 'summaryRow') {
        result.push({
          account_name: row.account_name,
          amount_cents: row.amount_cents,
          row_type:     'summaryRow',
          indent:       1,
        })
        if (row.children) traverse(row.children)

      } else if (row.row_type === 'row') {
        if (mode === 'detail') {
          result.push({
            account_name: row.account_name,
            amount_cents: row.amount_cents,
            row_type:     'row',
            indent:       1,
          })
        }
        if (row.children) traverse(row.children)
      }
    }
  }

  traverse(data.rows)
  return result
}

// ============================================================
// getSummaryValue
// ============================================================

/**
 * Searches the (possibly nested) row tree for a summaryRow whose
 * account_name exactly matches `accountName`.
 *
 * Returns amount_cents (may be null) when found, or null if not found.
 * Useful for extracting key balance-sheet figures.
 */
export function getSummaryValue(
  data:        FinancialData | null,
  accountName: string
): number | null {
  if (!data) return null

  function search(rows: FinancialRow[]): number | null {
    for (const row of rows) {
      if (row.row_type === 'summaryRow' && row.account_name === accountName) {
        return row.amount_cents
      }
      if (row.children) {
        const found = search(row.children)
        if (found !== null) return found
      }
    }
    return null
  }

  return search(data.rows)
}

// ============================================================
// getRowValue
// ============================================================

/**
 * Searches the row tree for ANY row (any row_type) matching
 * `accountName` by exact name. Returns amount_cents or null.
 * Used in the report table to look up individual row amounts
 * from a company's snapshot when the canonical row order comes
 * from a different company.
 */
export function getRowValue(
  data:        FinancialData | null,
  accountName: string
): number | null {
  if (!data) return null

  function search(rows: FinancialRow[]): number | null {
    for (const row of rows) {
      if (row.account_name === accountName && row.amount_cents !== null) {
        return row.amount_cents
      }
      if (row.children) {
        const found = search(row.children)
        if (found !== null) return found
      }
    }
    return null
  }

  return search(data.rows)
}

// ============================================================
// getPeriodLabel
// ============================================================

/**
 * Formats a YYYY-MM period string as a short human-readable label.
 * e.g. "2026-01" → "Jan 2026"
 */
export function getPeriodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

// ============================================================
// sumGroupTotal
// ============================================================

/**
 * Sums amounts across multiple company snapshots for a given account_name.
 * null + number → number (skip nulls)
 * all null → null
 */
export function sumGroupTotal(
  datasets:    (FinancialData | null)[],
  accountName: string
): number | null {
  let total:   number | null = null
  for (const data of datasets) {
    const val = getRowValue(data, accountName)
    if (val !== null) {
      total = (total ?? 0) + val
    }
  }
  return total
}
