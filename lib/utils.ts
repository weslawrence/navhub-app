import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Currency symbols ─────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  AUD: 'A$',
  NZD: 'NZ$',
  USD: 'US$',
  GBP: '£',
  SGD: 'S$',
}

function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `
}

// ─── formatCurrency ───────────────────────────────────────────────────────────

/**
 * Format an amount stored in cents using the user's preferred number format.
 *
 * @param amount   - integer cents (e.g. 1234567 = $12,345.67), or null → '—'
 * @param format   - 'thousands' | 'full' | 'smart'
 * @param currency - ISO 4217 code (default 'AUD')
 *
 * thousands: $1,235k   (round to nearest $1k)
 * full:      $12,346   (round to dollar)
 * smart:     ≥$1m → $1.2m  |  ≥$1k → $235k  |  <$1k → $235
 */
export function formatCurrency(
  amount:   number | null,
  format:   'thousands' | 'full' | 'smart' = 'thousands',
  currency  = 'AUD'
): string {
  if (amount === null) return '—'

  const sym     = currencySymbol(currency)
  const dollars = amount / 100

  if (format === 'full') {
    return sym + Math.round(dollars).toLocaleString('en-AU')
  }

  if (format === 'thousands') {
    const k = Math.round(dollars / 1000)
    return `${sym}${k.toLocaleString('en-AU')}k`
  }

  // smart
  const abs  = Math.abs(dollars)
  const sign = dollars < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}m`
  }
  if (abs >= 1_000) {
    return `${sign}${sym}${Math.round(abs / 1_000)}k`
  }
  return `${sign}${sym}${Math.round(abs).toLocaleString('en-AU')}`
}

// ─── formatVariance ───────────────────────────────────────────────────────────

export interface VarianceResult {
  value:      string
  direction:  'up' | 'down' | 'flat'
  isPositive: boolean
}

/**
 * Compute and format the change between two amounts.
 *
 * @param current      - current period amount in cents (or null)
 * @param prior        - prior period amount in cents (or null)
 * @param isCostMetric - if true, a decrease is considered positive (e.g. expenses going down)
 * @param format       - number format for the value string
 * @param currency     - ISO 4217 code
 */
export function formatVariance(
  current:      number | null,
  prior:        number | null,
  isCostMetric  = false,
  format:       'thousands' | 'full' | 'smart' = 'smart',
  currency      = 'AUD'
): VarianceResult {
  if (current === null || prior === null) {
    return { value: '—', direction: 'flat', isPositive: false }
  }

  const diff = current - prior

  if (diff === 0) {
    return { value: '±0', direction: 'flat', isPositive: true }
  }

  const direction: 'up' | 'down' = diff > 0 ? 'up' : 'down'
  const isPositive = isCostMetric ? direction === 'down' : direction === 'up'
  const sign       = diff > 0 ? '+' : '-'
  const formatted  = formatCurrency(Math.abs(diff), format, currency)

  return { value: `${sign}${formatted}`, direction, isPositive }
}

// ─── Period helpers ───────────────────────────────────────────────────────────

/** Returns the current period as 'YYYY-MM' */
export function getCurrentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Returns the period one month before the given 'YYYY-MM' */
export function getPreviousPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const d = new Date(year, month - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Returns the period one month after the given 'YYYY-MM' */
export function getNextPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const d = new Date(year, month, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Formats 'YYYY-MM' as a full month label, e.g. 'January 2026' */
export function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

/** Formats 'YYYY-MM' as a short label, e.g. 'Jan 2026' */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number)
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

/**
 * Returns all months in the current quarter up to and including the given period.
 * Calendar quarters: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
 */
export function getCurrentQuarterMonths(period: string): string[] {
  const [year, month] = period.split('-').map(Number)
  const quarterStart  = Math.floor((month - 1) / 3) * 3 + 1 // 1, 4, 7, or 10
  const months: string[] = []
  for (let m = quarterStart; m <= month; m++) {
    months.push(`${year}-${String(m).padStart(2, '0')}`)
  }
  return months
}

/**
 * Returns all months in the previous calendar quarter.
 */
export function getLastQuarterMonths(period: string): string[] {
  const [year, month] = period.split('-').map(Number)
  const quarterStart  = Math.floor((month - 1) / 3) * 3 + 1
  const prevQStart    = quarterStart - 3
  const months: string[] = []

  if (prevQStart >= 1) {
    for (let m = prevQStart; m < quarterStart; m++) {
      months.push(`${year}-${String(m).padStart(2, '0')}`)
    }
  } else {
    // Previous quarter spans the year boundary
    const prevYear = year - 1
    const startM   = 12 + prevQStart // e.g. if prevQStart = -2 → startM = 10
    for (let m = startM; m <= 12; m++) {
      months.push(`${prevYear}-${String(m).padStart(2, '0')}`)
    }
  }
  return months
}

/**
 * Returns all months in the Australian financial year (1 July → 30 June)
 * up to and including the given period.
 */
export function getYTDMonths(period: string): string[] {
  const [year, month] = period.split('-').map(Number)
  // AU FY starts July 1. Months July+ → FY started this year. Jan-June → FY started last year.
  const fyStartYear  = month >= 7 ? year : year - 1
  const months: string[] = []

  let y = fyStartYear
  let m = 7 // FY starts in July
  while (y < year || (y === year && m <= month)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

// ─── Legacy helpers (unchanged) ──────────────────────────────────────────────

/** Get the first and last day of a YYYY-MM period */
export function getPeriodDateRange(period: string): { fromDate: string; toDate: string } {
  const [year, month] = period.split('-').map(Number)
  const from = new Date(year, month - 1, 1)
  const to   = new Date(year, month, 0)
  return {
    fromDate: from.toISOString().split('T')[0],
    toDate:   to.toISOString().split('T')[0],
  }
}

/**
 * Generate a URL-safe slug from a display name.
 * e.g. "Acme Corp (AU)" → "acme-corp-au"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Get the last N months as YYYY-MM strings, most recent first */
export function getLastNMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year  = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${year}-${month}`)
  }
  return months
}
