// Which public holidays a site keeps (SPEC templates T6): one stored answer, `schema.holidays`, so the server, the
// Studio, the reminder mail and the site agree. The calendars themselves are in basics/holidays.ts.

/** One public holiday with its name for guests in German and English. */
export interface Holiday { date: string; de: string; en: string }
/** A site's own holidays: all holidays of `year`. */
export type HolidayCalendar = (year: number) => Holiday[]
/** The built-in calendars. `DE` has the nationwide holidays only. */
export type HolidayCalendarName = 'AT' | 'DE' | 'SG' | 'none'
/** The `calendar` option of a site: a built-in calendar or the site's own function. */
export type HolidaysOption = HolidayCalendarName | HolidayCalendar
/** `schema.holidays`: the resolved calendar; `custom` is a function in the site's code that only the site can run. */
export type StoredHolidays = HolidayCalendarName | 'custom'

export const CALENDAR_NAMES: readonly HolidayCalendarName[] = ['AT', 'DE', 'SG', 'none']
export const STORED_HOLIDAYS: readonly StoredHolidays[] = [...CALENDAR_NAMES, 'custom']

/** The built-in calendar of a country (ISO 3166-1 alpha-2). No new calendars without a table of their holidays. */
const COUNTRY_CALENDARS: Record<string, HolidayCalendarName> = { AT: 'AT', DE: 'DE', SG: 'SG' }

/** The calendar a country has, or `undefined` when Ginko has none for it. */
export function calendarOfCountry(country: string): HolidayCalendarName | undefined {
  return Object.hasOwn(COUNTRY_CALENDARS, country) ? COUNTRY_CALENDARS[country] : undefined
}

/**
 * The stored calendar of a site: an explicit `calendar` wins (a function is `custom`), else the calendar of `country`
 * (`none` for a country without one), else `undefined` (unset: each caller keeps its own default, Austria in the gastro preset).
 */
export function holidaysOf(site: { country?: string; calendar?: HolidaysOption }): StoredHolidays | undefined {
  if (site.calendar !== undefined) return typeof site.calendar === 'function' ? 'custom' : site.calendar
  if (site.country !== undefined) return calendarOfCountry(site.country) ?? 'none'
  return undefined
}
