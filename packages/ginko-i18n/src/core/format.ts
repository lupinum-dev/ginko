// Cached Intl formatters per BCP 47 tag, so `de-AT` keeps "Jänner".

const cache = new Map<string, unknown>()

function cached<T>(key: string, make: () => T): T {
  let value = cache.get(key) as T | undefined
  if (!value) cache.set(key, value = make())
  return value
}

export type DateStyle = 'short' | 'medium' | 'long' | 'full'

export interface FormatterOptions {
  /** IANA time zone (`Europe/Vienna`) for timestamps. Calendar dates always use UTC. Default `UTC`. */
  timeZone?: string
}

type DateInput = Date | number | string

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/
const isCalendarDate = (value: DateInput): value is string => typeof value === 'string' && CALENDAR_DATE.test(value)

function dateFormat(language: string, zone: string, options: DateStyle | Intl.DateTimeFormatOptions) {
  const resolved = typeof options === 'string' ? { dateStyle: options } : options
  return cached(`d|${language}|${zone}|${JSON.stringify(resolved)}`, () => new Intl.DateTimeFormat(language, { timeZone: zone, ...resolved }))
}

/** A calendar date (`2026-10-08`) is read as noon UTC, so no time zone moves it to another day. */
function toDate(value: DateInput): Date {
  return new Date(isCalendarDate(value) ? `${value}T12:00:00Z` : value)
}

/** Node and browsers ship different ICU data (plain, thin, no-break or narrow no-break spaces): plain spaces keep server and client text equal. */
const spaces = (text: string) => text.replace(/[\u00a0\u2009\u202f]/g, ' ')

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30.44 * DAY
const YEAR = 365.25 * DAY
/** Unit, its size in seconds, and the amount from which the next unit takes over. */
const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number, number][] = [
  ['second', 1, 60], ['minute', MINUTE, 60], ['hour', HOUR, 24], ['day', DAY, 7], ['week', WEEK, 5], ['month', MONTH, 12],
]

export function createFormatters(language: string, options: FormatterOptions = {}) {
  const zone = options.timeZone ?? 'UTC'
  const zoneFor = (value: DateInput) => (isCalendarDate(value) ? 'UTC' : zone)
  return {
    /** `8. Oktober 2026`. A style or Intl options; a calendar date (`2026-10-08`) never shifts a day. */
    date: (value: DateInput, options: DateStyle | Intl.DateTimeFormatOptions = 'long') =>
      spaces(dateFormat(language, zoneFor(value), options).format(toDate(value))),
    /**
     * `20.–21. Juni 2026` / `20–21 June 2026`; one day stays one date. Same options as `date`.
     * If either end is a calendar date, the whole range uses UTC so that date keeps its day.
     */
    range: (from: DateInput, to: DateInput, options: DateStyle | Intl.DateTimeFormatOptions = 'long') => {
      const [start, end] = [toDate(from), toDate(to)]
      const format = dateFormat(language, isCalendarDate(from) || isCalendarDate(to) ? 'UTC' : zone, options)
      if (start.getTime() === end.getTime()) return spaces(format.format(start))
      // Between two day numbers the dash stands without spaces ("20–21 June").
      return spaces(format.formatRange(start, end)).replace(/(\d\.?)\s?[–-]\s?(\d)/, '$1–$2')
    },
    /**
     * `5 minutes ago`, `yesterday`: the largest unit that fits. Call it after mount, or pass `now`,
     * because the text depends on the current time. Without that, server and client renders differ.
     */
    relative: (value: DateInput, now: Date | number = Date.now()) => {
      const formatter = cached(`r|${language}`, () => new Intl.RelativeTimeFormat(language, { numeric: 'auto' }))
      const seconds = (toDate(value).getTime() - new Date(now).getTime()) / 1000
      // Round first, then pick the unit: 59.7 minutes is "1 hour ago", not "60 minutes ago".
      for (const [unit, size, limit] of RELATIVE_UNITS) {
        const amount = Math.round(seconds / size)
        if (Math.abs(amount) < limit) return formatter.format(amount, unit)
      }
      return formatter.format(Math.round(seconds / YEAR), 'year')
    },
    number: (value: number, options?: Intl.NumberFormatOptions) =>
      spaces(cached(`n|${language}|${JSON.stringify(options ?? {})}`, () => new Intl.NumberFormat(language, options)).format(value)),
    currency: (value: number, currency: string) =>
      spaces(cached(`c|${language}|${currency}`, () => new Intl.NumberFormat(language, { style: 'currency', currency })).format(value)),
    list: (items: string[], type: Intl.ListFormatType = 'conjunction') =>
      cached(`l|${language}|${type}`, () => new Intl.ListFormat(language, { type })).format(items),
  }
}

export type Formatters = ReturnType<typeof createFormatters>
