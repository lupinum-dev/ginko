// Weekdays and calendar arithmetic on YYYY-MM-DD strings (no time zone involved).

import { DAY_KEYS, type DayKey } from '../core/time.ts'

/** The day keys of stored values, Monday first (core's `DAY_KEYS`). */
export const weekdayKeys = DAY_KEYS
export type Weekday = DayKey

/** Weekday key of a YYYY-MM-DD date. */
export function weekdayOf(date: string): Weekday {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return weekdayKeys[(day + 6) % 7]!
}

/** `date` moved by `n` days (calendar arithmetic). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
