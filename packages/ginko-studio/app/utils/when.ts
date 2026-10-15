// Points in time for drafts (SPEC 15): "Online ab …" is entered and shown in the site's time zone,
// whatever zone the laptop is in.
import { zoneOffset } from '@lupinum/ginko/internal'
import type { useI18n } from '#imports'

/** The Studio's translator and formatters, from `useI18n()` at setup. Plain functions take it as an argument. */
// `<''>` keeps the root namespace: ReturnType would widen the generic namespace and accept wrong keys.
export type Words = Pick<ReturnType<typeof useI18n<''>>, 't' | 'format'>

const DAY = 86_400_000

/**
 * The instants whose clock in `timeZone` reads `local` (`2026-10-14T09:00`, an `<input type="datetime-local">` value),
 * sorted: one normally, two in the hour the clocks go back, none in the hour they skip. Undefined when malformed.
 */
export function zonedTimes(local: string, timeZone: string): number[] | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!m) return undefined
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!)
  // The offsets a day before and after cover both sides of a switch; the round trip keeps only real readings.
  const guesses = new Set([wall - zoneOffset(timeZone, wall - DAY), wall - zoneOffset(timeZone, wall + DAY)])
  return [...guesses].filter((ms) => msToZoned(ms, timeZone) === local).sort((a, b) => a - b)
}

/**
 * Why a schedule form cannot be sent, as a Studio catalog key; undefined when `picked` (ScheduleField's choice for
 * `local`) is in the future. `timeMissing` is already said under the field.
 */
export function scheduleProblem(local: string, timeZone: string, picked: number | undefined, now: number): `entry.publish.${'futureTime' | 'timeMissing' | 'timePickOne'}` | undefined {
  if (picked !== undefined) return picked > now ? undefined : 'entry.publish.futureTime'
  const count = zonedTimes(local, timeZone)?.length
  return count === 0 ? 'entry.publish.timeMissing' : count === 2 ? 'entry.publish.timePickOne' : 'entry.publish.futureTime'
}

/** The zone of the person's device; differs from the site's when they work from elsewhere. Browser only (onMounted). */
export const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** ms → `2026-10-14T09:00` in `timeZone`, for an `<input type="datetime-local">`. */
export function msToZoned(ms: number, timeZone: string): string {
  const shifted = new Date(ms + zoneOffset(timeZone, ms))
  return shifted.toISOString().slice(0, 16)
}

/** One clock for every Studio time and language: 24 hours, two-digit hour ("02:30"), as the server's `::HHmm` history lines. */
const CLOCK = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const

/** Whether the clock in `timeZone` shows the time of `ms` twice: 02:30 on the night the clocks go back. */
export const twiceOnClock = (ms: number, timeZone: string) => zonedTimes(msToZoned(ms, timeZone), timeZone)?.length === 2

/** Then the zone's short name says which one ("02:30 MEZ"). */
const zoneIfTwice = (ms: number, timeZone: string) => (twiceOnClock(ms, timeZone) ? { timeZoneName: 'short' } as const : {})

/** "14. Okt., 09:00" in the site's time zone and the Studio's language: short, for toasts, status and lists. */
export function whenText(ms: number, timeZone: string, format: Words['format']): string {
  return format.date(ms, { timeZone, day: 'numeric', month: 'short', ...CLOCK, ...zoneIfTwice(ms, timeZone) })
}

/** "02:30 MESZ": a clock with its zone's short name, to tell the two 02:30 of the night the clocks go back apart. */
export function clockWithZone(ms: number, timeZone: string, format: Words['format']): string {
  return format.date(ms, { timeZone, ...CLOCK, timeZoneName: 'short' })
}

/** "14.10.2026, 09:00" in the site's time zone: with the year, for History, reviews and files. */
export function whenFull(ms: number, timeZone: string, format: Words['format']): string {
  return format.date(ms, { timeZone, day: 'numeric', month: 'numeric', year: 'numeric', ...CLOCK, ...zoneIfTwice(ms, timeZone) })
}
