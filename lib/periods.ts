/**
 * FY-aware period calculations.
 * All functions accept fyEndMonth (1–12) to support any financial year end.
 *
 * Examples:
 *  fyEndMonth = 6  → FY ends 30 June  (AU standard)   FY starts 1 July
 *  fyEndMonth = 12 → FY ends 31 Dec   (calendar year) FY starts 1 Jan
 *  fyEndMonth = 3  → FY ends 31 March (NZ standard)   FY starts 1 April
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ─── Core helpers ─────────────────────────────────────────────────────────────

/** The calendar month (1–12) that the FY starts in. */
export function fyStartMonth(fyEndMonth: number): number {
  return (fyEndMonth % 12) + 1
}

/**
 * The FY year label for a given calendar date.
 * FY year = the calendar year in which the FY ends.
 *
 * e.g. fyEndMonth=6 (June):
 *   2024-07 → FY2025   (July 2024 is in FY that ends June 2025)
 *   2025-06 → FY2025   (June 2025 is the last month of FY2025)
 */
export function getFYYear(calYear: number, calMonth: number, fyEndMonth: number): number {
  if (calMonth <= fyEndMonth) {
    return calYear
  }
  return calYear + 1
}

/**
 * FY quarter (1–4) for a given calendar date.
 *
 * e.g. fyEndMonth=6 (AU): Q1=Jul–Sep, Q2=Oct–Dec, Q3=Jan–Mar, Q4=Apr–Jun
 */
export function getFYQuarter(calMonth: number, fyEndMonth: number): number {
  const start = fyStartMonth(fyEndMonth)
  const pos   = ((calMonth - start + 12) % 12)
  return Math.floor(pos / 3) + 1
}

/**
 * Return the 3 YYYY-MM strings for a given FY quarter.
 *
 * fyYear   = the year in which the FY ends
 * quarter  = 1–4
 */
export function getFYQuarterMonths(
  fyYear:      number,
  quarter:     number,
  fyEndMonth:  number,
): string[] {
  const start    = fyStartMonth(fyEndMonth)
  // Offset of the first month of this quarter from FY start (0-based)
  const offset   = (quarter - 1) * 3
  const months: string[] = []

  for (let i = 0; i < 3; i++) {
    // Month within FY (0-based from FY start)
    const fyMonthIdx = offset + i
    // Convert to calendar month/year
    const calMonth   = ((start - 1 + fyMonthIdx) % 12) + 1
    // Year adjustment: if calMonth < start (in the latter half of the FY spanning new year)
    const calYear    = calMonth <= fyEndMonth ? fyYear : fyYear - 1
    months.push(`${calYear}-${String(calMonth).padStart(2, '0')}`)
  }
  return months
}

/**
 * All months in the FY that ends in fyYear.
 */
export function getFYAllMonths(fyYear: number, fyEndMonth: number): string[] {
  return getFYQuarterMonths(fyYear, 1, fyEndMonth)
    .concat(getFYQuarterMonths(fyYear, 2, fyEndMonth))
    .concat(getFYQuarterMonths(fyYear, 3, fyEndMonth))
    .concat(getFYQuarterMonths(fyYear, 4, fyEndMonth))
}

/**
 * All months from FY start up to and including the given period (YTD).
 */
export function getYTDMonthsFY(period: string, fyEndMonth: number): string[] {
  const [year, month] = period.split('-').map(Number)
  const fyYear        = getFYYear(year, month, fyEndMonth)
  const all           = getFYAllMonths(fyYear, fyEndMonth)
  // Keep only months up to and including the given period
  return all.filter(m => m <= period)
}

/**
 * All months in the current FY quarter for the given period (QTD).
 */
export function getQTDMonthsFY(period: string, fyEndMonth: number): string[] {
  const [year, month] = period.split('-').map(Number)
  const fyYear        = getFYYear(year, month, fyEndMonth)
  const quarter       = getFYQuarter(month, fyEndMonth)
  const all           = getFYQuarterMonths(fyYear, quarter, fyEndMonth)
  return all.filter(m => m <= period)
}

/**
 * All months in the previous FY quarter relative to the given period.
 */
export function getLastQuarterMonthsFY(period: string, fyEndMonth: number): string[] {
  const [year, month] = period.split('-').map(Number)
  const fyYear        = getFYYear(year, month, fyEndMonth)
  const quarter       = getFYQuarter(month, fyEndMonth)
  const prevQ         = quarter === 1 ? 4 : quarter - 1
  const prevFYYear    = quarter === 1 ? fyYear - 1 : fyYear
  return getFYQuarterMonths(prevFYYear, prevQ, fyEndMonth)
}

// ─── PeriodSelector helpers ────────────────────────────────────────────────────

export interface PeriodOption {
  value: string         // YYYY-MM (last month of the period)
  label: string
  type:  'month' | 'quarter' | 'fy_year'
}

/**
 * Generate period options for a PeriodSelector dropdown.
 * Returns the last N months, FY quarters, and FY years relative to today.
 */
export function buildPeriodOptions(fyEndMonth: number, monthsBack = 24): PeriodOption[] {
  const now       = new Date()
  const nowYear   = now.getFullYear()
  const nowMonth  = now.getMonth() + 1
  const options:  PeriodOption[] = []

  // ── Monthly options ────────────────────────────────────────────────────────
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(nowYear, nowMonth - 1 - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const period = `${y}-${String(m).padStart(2, '0')}`
    options.push({
      value: period,
      label: d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
      type:  'month',
    })
  }

  // ── Quarterly options (last 8 quarters) ───────────────────────────────────
  const seenQuarters = new Set<string>()
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(nowYear, nowMonth - 1 - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const fyYear  = getFYYear(y, m, fyEndMonth)
    const quarter = getFYQuarter(m, fyEndMonth)
    const key     = `${fyYear}-Q${quarter}`
    if (seenQuarters.has(key)) continue
    seenQuarters.add(key)
    // Last month of this quarter
    const qMonths    = getFYQuarterMonths(fyYear, quarter, fyEndMonth)
    const lastMonth  = qMonths[qMonths.length - 1]
    options.push({
      value: lastMonth,
      label: `Q${quarter} FY${fyYear}`,
      type:  'quarter',
    })
    if (seenQuarters.size >= 8) break
  }

  // ── FY Year options (last 5 FY years) ─────────────────────────────────────
  const currentFYYear = getFYYear(nowYear, nowMonth, fyEndMonth)
  for (let fy = currentFYYear; fy >= currentFYYear - 4; fy--) {
    const fyMonths  = getFYAllMonths(fy, fyEndMonth)
    const lastMonth = fyMonths[fyMonths.length - 1]
    options.push({
      value: lastMonth,
      label: `FY${fy} (${MONTH_NAMES[fyStartMonth(fyEndMonth) - 1]} ${fy - 1}–${MONTH_NAMES[fyEndMonth - 1]} ${fy})`,
      type:  'fy_year',
    })
  }

  return options
}

/** Month name for display (1=January, 12=December) */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? ''
}
