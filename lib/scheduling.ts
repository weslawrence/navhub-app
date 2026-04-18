import type { Agent } from './types'

export interface ScheduleConfig {
  frequency: 'daily' | 'weekly' | 'monthly'
  time: string         // HH:MM in 24h
  day_of_week?: number // 0=Sun … 6=Sat for weekly
  day_of_month?: number // 1-28 for monthly
  timezone?: string    // default 'Australia/Brisbane'
}

const DEFAULT_TZ = 'Australia/Brisbane'

/**
 * Parse a time string "HH:MM" into hours and minutes.
 */
function parseTime(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(':').map(Number)
  return { hours: h ?? 0, minutes: m ?? 0 }
}

/**
 * Get a Date representing the given wall-clock time in a timezone, on the given UTC date.
 * We use Intl to find the UTC offset and construct the correct Date.
 */
function getLocalDate(
  year: number,
  month: number, // 0-indexed
  day: number,
  hours: number,
  minutes: number,
  tz: string
): Date {
  // Try constructing the date and adjusting for timezone offset
  // Use a trick: create date in the target timezone
  const candidate = new Date(Date.UTC(year, month, day, hours, minutes, 0))

  // Get what the timezone thinks this UTC time is
  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(candidate)

  const tzMap: Record<string, number> = {}
  for (const part of tzParts) {
    if (part.type !== 'literal') tzMap[part.type] = Number(part.value)
  }

  // Compute offset
  const offsetMs =
    candidate.getTime() -
    Date.UTC(
      tzMap['year']!,
      (tzMap['month']! - 1),
      tzMap['day']!,
      tzMap['hour'] === 24 ? 0 : tzMap['hour']!,
      tzMap['minute']!
    )

  // Construct the correct UTC time for the desired local time
  return new Date(Date.UTC(year, month, day, hours, minutes, 0) + offsetMs)
}

/**
 * Get what the wall-clock date looks like in the given timezone right now.
 */
function nowInTz(tz: string, from: Date = new Date()): {
  year: number; month: number; day: number; hours: number; minutes: number; dayOfWeek: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(from)

  const map: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value
  }

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    year: Number(map['year']),
    month: Number(map['month']) - 1, // 0-indexed
    day: Number(map['day']),
    hours: Number(map['hour']) === 24 ? 0 : Number(map['hour']),
    minutes: Number(map['minute']),
    dayOfWeek: weekdays.indexOf(map['weekday'] ?? 'Sun'),
  }
}

/**
 * Calculate the next run time from a schedule config.
 * `groupTimezone` (if supplied) takes precedence over the legacy
 * config.timezone field and the DEFAULT_TZ fallback.
 */
export function getNextRunTime(
  config:        ScheduleConfig,
  from:          Date   = new Date(),
  groupTimezone?: string,
): Date {
  const tz = groupTimezone ?? config.timezone ?? DEFAULT_TZ
  const { hours, minutes } = parseTime(config.time)
  const local = nowInTz(tz, from)

  if (config.frequency === 'daily') {
    // Try today first
    const todayRun = getLocalDate(local.year, local.month, local.day, hours, minutes, tz)
    if (todayRun > from) return todayRun
    // Tomorrow
    const tomorrow = new Date(from)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    const tomorrowLocal = nowInTz(tz, tomorrow)
    return getLocalDate(tomorrowLocal.year, tomorrowLocal.month, tomorrowLocal.day, hours, minutes, tz)
  }

  if (config.frequency === 'weekly') {
    const targetDow = config.day_of_week ?? 1 // default Monday
    let daysAhead = targetDow - local.dayOfWeek
    if (daysAhead < 0) daysAhead += 7

    // If same day, check if time has passed
    if (daysAhead === 0) {
      const todayRun = getLocalDate(local.year, local.month, local.day, hours, minutes, tz)
      if (todayRun > from) return todayRun
      daysAhead = 7
    }

    const target = new Date(from)
    target.setUTCDate(target.getUTCDate() + daysAhead)
    const targetLocal = nowInTz(tz, target)
    return getLocalDate(targetLocal.year, targetLocal.month, targetLocal.day, hours, minutes, tz)
  }

  if (config.frequency === 'monthly') {
    const targetDay = Math.min(config.day_of_month ?? 1, 28)

    // Try this month
    const thisMonthRun = getLocalDate(local.year, local.month, targetDay, hours, minutes, tz)
    if (thisMonthRun > from) return thisMonthRun

    // Next month
    const nextMonth = local.month === 11 ? 0 : local.month + 1
    const nextYear = local.month === 11 ? local.year + 1 : local.year
    return getLocalDate(nextYear, nextMonth, targetDay, hours, minutes, tz)
  }

  // Fallback: 24 hours from now
  return new Date(from.getTime() + 24 * 60 * 60 * 1000)
}

/**
 * Calculate the next run after a completed run.
 */
export function calculateNextRun(config: ScheduleConfig, after: Date, groupTimezone?: string): Date {
  return getNextRunTime(config, after, groupTimezone)
}

/**
 * Check if an agent is due to run.
 */
export function isDue(agent: Agent, now: Date = new Date()): boolean {
  if (!agent.schedule_enabled || !agent.schedule_config || !agent.next_scheduled_run_at) {
    return false
  }
  return new Date(agent.next_scheduled_run_at) <= now
}

/**
 * Format next run time for display: "Thursday 20 March at 09:00 AEST"
 */
export function formatNextRun(date: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}
