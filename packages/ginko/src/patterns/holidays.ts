// Public holiday calendars. The site picks one with `country` or `calendar` in ginko.config.ts (stored as
// `schema.holidays`); the hours rules take it as `ctx.calendar` or `ctx.country`.
// Holiday names for guests come in German and English only (`de`, `en`); a site in another language shows its own text.
import type { Holiday, HolidayCalendar, HolidayCalendarName, HolidaysOption } from '../core/holidays.ts'
import { addDays, weekdayOf } from './weekdays.ts'

export type { Holiday, HolidayCalendar, HolidayCalendarName, HolidaysOption }
export interface HolidayNames { de: string; en: string }

/** Easter Sunday (Gregorian computus, Meeus/Jones/Butcher). */
function easter(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const g = Math.floor((8 * b + 13) / 25)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 19 * l) / 433)
  const month = Math.floor((h + l - 7 * m + 90) / 25)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const byDate = (list: Holiday[]) => list.sort((p, q) => p.date.localeCompare(q.date))

export function austrianHolidays(year: number): Holiday[] {
  const y = String(year)
  const easterSunday = easter(year)
  return byDate([
    { date: `${y}-01-01`, de: 'Neujahr', en: 'New Year’s Day' },
    { date: `${y}-01-06`, de: 'Heilige Drei Könige', en: 'Epiphany' },
    { date: addDays(easterSunday, 1), de: 'Ostermontag', en: 'Easter Monday' },
    { date: `${y}-05-01`, de: 'Staatsfeiertag', en: 'Labour Day' },
    { date: addDays(easterSunday, 39), de: 'Christi Himmelfahrt', en: 'Ascension Day' },
    { date: addDays(easterSunday, 50), de: 'Pfingstmontag', en: 'Whit Monday' },
    { date: addDays(easterSunday, 60), de: 'Fronleichnam', en: 'Corpus Christi' },
    { date: `${y}-08-15`, de: 'Mariä Himmelfahrt', en: 'Assumption Day' },
    { date: `${y}-10-26`, de: 'Nationalfeiertag', en: 'Austrian National Day' },
    { date: `${y}-11-01`, de: 'Allerheiligen', en: 'All Saints’ Day' },
    { date: `${y}-12-08`, de: 'Mariä Empfängnis', en: 'Immaculate Conception' },
    { date: `${y}-12-25`, de: 'Christtag', en: 'Christmas Day' },
    { date: `${y}-12-26`, de: 'Stefanitag', en: 'St. Stephen’s Day' },
  ])
}

/**
 * German nationwide public holidays only (9 days). Regional ones are NOT included: Heilige Drei Könige,
 * Fronleichnam, Mariä Himmelfahrt, Reformationstag, Allerheiligen, Buß- und Bettag, Frauentag and others.
 * Pass your own calendar function as `calendar` when the state has more.
 */
export function germanHolidays(year: number): Holiday[] {
  const y = String(year)
  const easterSunday = easter(year)
  return byDate([
    { date: `${y}-01-01`, de: 'Neujahr', en: 'New Year’s Day' },
    { date: addDays(easterSunday, -2), de: 'Karfreitag', en: 'Good Friday' },
    { date: addDays(easterSunday, 1), de: 'Ostermontag', en: 'Easter Monday' },
    { date: `${y}-05-01`, de: 'Tag der Arbeit', en: 'Labour Day' },
    { date: addDays(easterSunday, 39), de: 'Christi Himmelfahrt', en: 'Ascension Day' },
    { date: addDays(easterSunday, 50), de: 'Pfingstmontag', en: 'Whit Monday' },
    { date: `${y}-10-03`, de: 'Tag der Deutschen Einheit', en: 'German Unity Day' },
    { date: `${y}-12-25`, de: '1. Weihnachtstag', en: 'Christmas Day' },
    { date: `${y}-12-26`, de: '2. Weihnachtstag', en: 'Boxing Day' },
  ])
}

// Singapore: lunar, Islamic and Hindu holidays cannot be computed simply, so they are a table of the
// official dates. Source: Ministry of Manpower, https://www.mom.gov.sg/employment-practices/public-holidays
// (checked 2026-10-11). Other years need a new row from that page; until then only the fixed-date
// holidays are known. A holiday on a Sunday moves to the Monday; that is applied in `singaporeHolidays`.
const singaporeTable: Record<number, Holiday[]> = {
  2026: [
    { date: '2026-02-17', de: 'Chinesisches Neujahr', en: 'Chinese New Year' },
    { date: '2026-02-18', de: 'Chinesisches Neujahr', en: 'Chinese New Year' },
    { date: '2026-03-21', de: 'Hari Raya Puasa', en: 'Hari Raya Puasa' },
    { date: '2026-04-03', de: 'Karfreitag', en: 'Good Friday' },
    { date: '2026-05-27', de: 'Hari Raya Haji', en: 'Hari Raya Haji' },
    { date: '2026-05-31', de: 'Vesak', en: 'Vesak Day' },
    { date: '2026-11-08', de: 'Deepavali', en: 'Deepavali' },
  ],
  2027: [
    { date: '2027-02-06', de: 'Chinesisches Neujahr', en: 'Chinese New Year' },
    { date: '2027-02-07', de: 'Chinesisches Neujahr', en: 'Chinese New Year' },
    { date: '2027-03-10', de: 'Hari Raya Puasa', en: 'Hari Raya Puasa' },
    { date: '2027-03-26', de: 'Karfreitag', en: 'Good Friday' },
    { date: '2027-05-17', de: 'Hari Raya Haji', en: 'Hari Raya Haji' },
    { date: '2027-05-20', de: 'Vesak', en: 'Vesak Day' },
    { date: '2027-10-28', de: 'Deepavali', en: 'Deepavali' },
  ],
}

export function singaporeHolidays(year: number): Holiday[] {
  const y = String(year)
  const base: Holiday[] = [
    { date: `${y}-01-01`, de: 'Neujahr', en: 'New Year’s Day' },
    { date: `${y}-05-01`, de: 'Tag der Arbeit', en: 'Labour Day' },
    { date: `${y}-08-09`, de: 'Nationalfeiertag', en: 'National Day' },
    { date: `${y}-12-25`, de: 'Weihnachten', en: 'Christmas Day' },
    ...(singaporeTable[year] ?? []),
  ]
  const out = [...base]
  for (const h of base) {
    if (weekdayOf(h.date) === 'su') out.push({ date: addDays(h.date, 1), de: `${h.de} (Ersatztag)`, en: `${h.en} (observed)` })
  }
  return byDate(out)
}

const calendars: Record<HolidayCalendarName, HolidayCalendar> = { AT: austrianHolidays, DE: germanHolidays, SG: singaporeHolidays, none: () => [] }

/** The calendar function for a name or a custom function. */
export function calendarOf(option: HolidaysOption): HolidayCalendar {
  return typeof option === 'function' ? option : calendars[option]
}
