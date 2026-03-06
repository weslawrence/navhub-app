import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a YYYY-MM period string to a readable label, e.g. "Jan 2025" */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, 1)
  return date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

/** Format cents as a currency string, e.g. 1234567 → "$12,345.67" */
export function formatCurrency(cents: number | null, currency = 'AUD'): string {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

/** Get the first and last day of a YYYY-MM period */
export function getPeriodDateRange(period: string): { fromDate: string; toDate: string } {
  const [year, month] = period.split('-').map(Number)
  const from = new Date(year, month - 1, 1)
  const to = new Date(year, month, 0) // last day of month
  return {
    fromDate: from.toISOString().split('T')[0],
    toDate: to.toISOString().split('T')[0],
  }
}

/**
 * Generate a URL-safe slug from a display name.
 * Lowercases, strips special characters, replaces spaces with hyphens.
 * e.g. "Acme Corp (AU)" → "acme-corp-au"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')  // strip non-alphanumeric (keep spaces + hyphens)
    .replace(/\s+/g, '-')           // spaces → hyphens
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-|-$/g, '')          // trim leading/trailing hyphens
}

/** Get the last N months as YYYY-MM strings, most recent first */
export function getLastNMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${year}-${month}`)
  }
  return months
}
