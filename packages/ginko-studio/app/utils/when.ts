// Points in time for drafts (SPEC 15): "Online ab …" is entered and shown in the site's time zone,
// whatever zone the laptop is in.
import type { useI18n } from '#imports'

/** The Studio's translator and formatters, from `useI18n()` at setup. Plain functions take it as an argument. */
// `<''>` keeps the root namespace: ReturnType would widen the generic namespace and accept wrong keys.
export type Words = Pick<ReturnType<typeof useI18n<''>>, 't' | 'format'>

/** Offset of `timeZone` from UTC at `ms`, in ms (e.g. +2 h for Vienna in summer). */
function offsetAt(ms: number, timeZone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(ms).map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!)
  return asUtc - Math.floor(ms / 1000) * 1000
}

/** `2026-10-14T09:00` (an `<input type="datetime-local">` value) in `timeZone` → ms; undefined when malformed. */
export function zonedToMs(local: string, timeZone: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!m) return undefined
  const wall = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!)
  // Two passes: the offset at the guess can differ from the offset at the result around a DST switch.
  const first = wall - offsetAt(wall, timeZone)
  return wall - offsetAt(first, timeZone)
}

/** ms → `2026-10-14T09:00` in `timeZone`, for an `<input type="datetime-local">`. */
export function msToZoned(ms: number, timeZone: string): string {
  const shifted = new Date(ms + offsetAt(ms, timeZone))
  return shifted.toISOString().slice(0, 16)
}

/** "14. Okt., 09:00" in the site's time zone and the Studio's language, as the server writes it in the history. */
export function whenText(ms: number, timeZone: string, format: Words['format']): string {
  return format.date(ms, { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: false })
}
