// Synced from templates/_features/hours/app/utils/hours.ts by `pnpm templates sync`. Edit the source, not this copy.
// The rules behind "open now" without Vue or Nuxt: plain functions of dates, times and the hours line of the basics.
// useHours and the components use them (auto-imported from app/utils/); tests import this file directly.
import { spansText, type HoursLine, type Span } from '@lupinum/ginko/basics'

/** `YYYY-MM-DD` plus `days`. */
export function plusDays(date: string, days: number): string {
  const time = Date.parse(`${date}T12:00:00Z`) + days * 864e5
  return new Date(time).toISOString().slice(0, 10)
}

/** Opening spans as text ("11:30–14:00 and 17:30–22:00"), each span kept on one line by a word joiner on both sides
 *  of its dash: a narrow screen breaks between two spans, never inside one. */
export function spansLine(spans: Span[], and: string): string {
  return spansText(spans, and).replaceAll('–', '\u2060–\u2060')
}

/** The clock time (`HH:MM`, 24 h) of an instant in a time zone. */
export function clockIn(timeZone: string, time: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time)
}

/**
 * What a visitor needs to know right now, from today's opening times and the clock:
 * open (until when), opening later today (at what time), over for today, closed today (why), or nothing entered.
 */
export type HoursNow =
  | { kind: 'open', until: string }
  | { kind: 'later', at: string, again: boolean }
  | { kind: 'over' }
  | { kind: 'closed', reason?: string, holiday?: { de: string, en: string } }
  | { kind: 'unknown' }

/**
 * Today's state at `clock` from the hours line of the basics (`hoursLine`). A span that ends at or before it starts
 * runs past midnight: today's from its start on, and `yesterday`'s (the previous day's spans) until its end, whatever
 * today holds, so at 01:00 after a Saturday 18:00–02:00 the place is still open.
 */
export function hoursNow(line: HoursLine, clock: string, locale: string, yesterday: readonly Span[] = []): HoursNow {
  const carried = yesterday.find(({ from, to }) => to <= from && clock < to)
  if (carried) return { kind: 'open', until: carried.to }
  if (line.state === 'unknown') return { kind: 'unknown' }
  if (line.state === 'closed') {
    const reason = typeof line.reason === 'string' ? line.reason : line.reason?.[locale] ?? Object.values(line.reason ?? {})[0]
    return { kind: 'closed', reason, holiday: line.holiday }
  }
  const ranges = [...line.ranges].sort((a, b) => a[0].localeCompare(b[0]))
  const open = ranges.find(([from, to]) => clock >= from && (to <= from || clock < to))
  if (open) return { kind: 'open', until: open[1] }
  const next = ranges.findIndex(([from]) => from > clock)
  if (next === -1) return { kind: 'over' }
  return { kind: 'later', at: ranges[next]![0], again: next > 0 }
}
