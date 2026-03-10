// ============================================================
// Phase 4a — Cash Flow Projection Engine
// ============================================================

import type { CashflowItem, CashflowSettings, ForecastGrid, ForecastRow, ForecastSection } from '@/lib/types'

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Return the start of the week containing `date`.
 * weekStartDay: 0 = Sunday … 6 = Saturday (JS convention).
 */
export function getWeekStart(date: Date, weekStartDay: number): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day  = d.getDay()
  const diff = ((day - weekStartDay) + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

/**
 * Return ISO date strings for the 13-week window starting from the current week.
 * weekStartDay: 0 = Sunday … 6 = Saturday.
 */
export function get13Weeks(weekStartDay: number): string[] {
  const today          = new Date()
  const currentWeekStart = getWeekStart(today, weekStartDay)
  const weeks: string[] = []

  for (let i = 0; i < 13; i++) {
    const w = new Date(currentWeekStart)
    w.setDate(w.getDate() + i * 7)
    weeks.push(w.toISOString().split('T')[0])
  }
  return weeks
}

/** Format ISO date to "DD MMM" for column headers, e.g. "07 Apr" */
export function formatWeekHeader(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
}

// ─── Projection engine ────────────────────────────────────────────────────────

/**
 * Given a single CashflowItem and the 13-week date array,
 * return an array of amount_cents for each week (0 if no occurrence).
 */
export function projectItem(item: CashflowItem, weeks: string[]): number[] {
  if (!item.is_active) return weeks.map(() => 0)

  const itemStart = new Date(item.start_date + 'T00:00:00')
  const itemEnd   = item.end_date ? new Date(item.end_date + 'T00:00:00') : null

  return weeks.map(weekStartStr => {
    const weekStart = new Date(weekStartStr + 'T00:00:00')
    const weekEnd   = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    // Item hasn't started yet or already ended
    if (itemStart > weekEnd) return 0
    if (itemEnd && itemEnd < weekStart) return 0

    switch (item.recurrence) {
      case 'weekly': {
        if (item.day_of_week === null) return 0
        // Find the occurrence date within this week
        const weekDay    = weekStart.getDay()
        const diff       = ((item.day_of_week - weekDay) + 7) % 7
        const targetDate = new Date(weekStart)
        targetDate.setDate(targetDate.getDate() + diff)

        if (targetDate < itemStart) return 0
        if (itemEnd && targetDate > itemEnd) return 0
        return item.amount_cents
      }

      case 'fortnightly': {
        if (item.day_of_week === null) return 0
        // Determine which fortnightly cycle this week belongs to
        const msPerWeek = 7 * 24 * 3600 * 1000
        const weeksSinceStart = Math.floor(
          (weekStart.getTime() - itemStart.getTime()) / msPerWeek
        )
        if (weeksSinceStart < 0) return 0
        if (weeksSinceStart % 2 !== 0) return 0   // off-week

        const weekDay    = weekStart.getDay()
        const diff       = ((item.day_of_week - weekDay) + 7) % 7
        const targetDate = new Date(weekStart)
        targetDate.setDate(targetDate.getDate() + diff)

        if (targetDate < itemStart) return 0
        if (itemEnd && targetDate > itemEnd) return 0
        return item.amount_cents
      }

      case 'monthly': {
        if (item.day_of_month === null) return 0
        // Check if day_of_month falls in this 7-day window
        // A week can span two months — check both
        const monthsToCheck = new Set<string>()
        monthsToCheck.add(`${weekStart.getFullYear()}-${weekStart.getMonth()}`)
        monthsToCheck.add(`${weekEnd.getFullYear()}-${weekEnd.getMonth()}`)

        for (const key of Array.from(monthsToCheck)) {
          const [yearStr, monStr] = key.split('-')
          const year  = Number(yearStr)
          const month = Number(monStr)
          // Clamp day_of_month to last day of that month
          const lastDay    = new Date(year, month + 1, 0).getDate()
          const dom        = Math.min(item.day_of_month, lastDay)
          const targetDate = new Date(year, month, dom)

          if (targetDate >= weekStart && targetDate <= weekEnd) {
            if (targetDate < itemStart) return 0
            if (itemEnd && targetDate > itemEnd) return 0
            return item.amount_cents
          }
        }
        return 0
      }

      case 'one_off': {
        const targetDate = new Date(item.start_date + 'T00:00:00')
        if (targetDate >= weekStart && targetDate <= weekEnd) {
          return item.amount_cents
        }
        return 0
      }

      default:
        return 0
    }
  })
}

// ─── Grid builder ─────────────────────────────────────────────────────────────

interface BuildForecastGridParams {
  items:    CashflowItem[]
  settings: CashflowSettings
  weeks:    string[]
}

function buildSection(
  sectionItems: CashflowItem[],
  weeks:        string[]
): ForecastSection {
  const rows: ForecastRow[] = sectionItems.map(item => ({
    item_id:        item.id,
    label:          item.label,
    amounts_cents:  projectItem(item, weeks),
    is_editable:    true,
    pending_review: item.pending_review,
  }))

  const subtotals = weeks.map((_, i) =>
    rows.reduce((sum, row) => sum + row.amounts_cents[i], 0)
  )

  return { rows, subtotals }
}

/**
 * Build a complete 13-week ForecastGrid from items + settings.
 */
export function buildForecastGrid(params: BuildForecastGridParams): ForecastGrid {
  const { items, settings, weeks } = params

  const inflows        = buildSection(items.filter(i => i.section === 'inflow'),         weeks)
  const regularOutflows = buildSection(items.filter(i => i.section === 'regular_outflow'), weeks)
  const payables       = buildSection(items.filter(i => i.section === 'payable'),        weeks)

  // Net = inflows − outflows − payables (outflows and payables are costs)
  const netCashFlow = weeks.map((_, i) =>
    inflows.subtotals[i] - regularOutflows.subtotals[i] - payables.subtotals[i]
  )

  // Rolling opening/closing balance
  const openingBalance: number[] = []
  const closingBalance: number[] = []
  let balance = settings.opening_balance_cents

  for (let i = 0; i < weeks.length; i++) {
    openingBalance.push(balance)
    balance += netCashFlow[i]
    closingBalance.push(balance)
  }

  return {
    weeks,
    sections: {
      inflows,
      regularOutflows,
      payables,
    },
    summary: {
      netCashFlow,
      openingBalance,
      closingBalance,
    },
  }
}
