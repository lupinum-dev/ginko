// Dates in the site's time zone. "Today" never comes from the editor's device (SPEC 2.7, B7).

/** `YYYY-MM-DD` of `now` in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

const readers = new Map<string, Intl.DateTimeFormat>()

/** How far `timeZone` is ahead of UTC at the instant `ms`, in ms (+1 h for Vienna in winter, +2 h in summer). */
export function zoneOffset(timeZone: string, ms: number): number {
  let reader = readers.get(timeZone)
  if (!reader) readers.set(timeZone, reader = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }))
  const parts = reader.formatToParts(ms)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return local - Math.floor(ms / 1000) * 1000
}

/**
 * A wall-clock time in `timeZone` as ISO 8601 with its offset: `2026-12-03` `19:30` in Europe/Vienna →
 * `2026-12-03T19:30:00+01:00` (`+02:00` in summer). In the hour a clock change skips or repeats, the offset is one of
 * the two (no event is planned for a time that does not exist).
 */
export function zonedDateTime(date: string, time: string, timeZone: string): string {
  const naive = Date.parse(`${date}T${time}:00Z`)
  const minutes = Math.round(zoneOffset(timeZone, naive - zoneOffset(timeZone, naive)) / 60_000)
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${date}T${time}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** First day of the week and weekend days, ISO numbering (1 = Monday, 7 = Sunday). */
export interface WeekInfo {
  firstDay: 1 | 2 | 3 | 4 | 5 | 6 | 7
  weekend: number[]
}

/**
 * The week of a site that states none (it has no weekly brick): Monday first, Saturday and Sunday off. Only the Studio's
 * calendar and the day of the weekly reminder mail of such a site read it; a weekly brick reads the stated `week`.
 */
export const DEFAULT_WEEK: WeekInfo = { firstDay: 1, weekend: [6, 7] }

/** The days of the week, Monday first, as `week.firstDay` names them. */
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type Weekday = (typeof WEEKDAYS)[number]

/**
 * The site's week, as the site states it (`defineSite({ week })`) and the schema stores it: the day the week starts on
 * and how many days from that day on are workdays (`{ firstDay: 'monday', workdays: 5 }`: Monday to Friday). Weekly
 * bricks (`@workWeek`, `plans`) start their weeks on `firstDay`; after the last workday, the coming week counts.
 */
export interface SiteWeek {
  firstDay: Weekday
  workdays: 1 | 2 | 3 | 4 | 5 | 6 | 7
}

/**
 * The week a site states, in ISO numbers for the date helpers. Throws when the site states none: `checkSchema` requires
 * `week` on a site with a weekly brick, so only a reader outside a weekly brick can get here.
 */
export function weekInfo(week: SiteWeek | undefined): WeekInfo {
  if (!week) throw new Error("The site states no week. Add `week: { firstDay: 'monday', workdays: 5 }` (your values) to defineSite in ginko.config.ts.")
  const firstDay = (WEEKDAYS.indexOf(week.firstDay) + 1) as WeekInfo['firstDay']
  const weekend = [...Array(7 - week.workdays).keys()].map((i) => ((firstDay - 1 + week.workdays + i) % 7) + 1)
  return { firstDay, weekend }
}

/** The keys of the days in stored values (a rows field of weekdays, the opening hours), Monday first. */
export const DAY_KEYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const
export type DayKey = (typeof DAY_KEYS)[number]

/** The site's seven days in its order, from `week.firstDay` on: the first `week.workdays` of them are its workdays. Throws without a week. */
export function daysOf(week: SiteWeek | undefined): DayKey[] {
  const first = weekInfo(week).firstDay - 1
  return DAY_KEYS.map((_, i) => DAY_KEYS[(first + i) % 7]!)
}

const isoDay = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7 // 1 = Monday, 7 = Sunday

/** Days since the week started: 0 on its first day, 6 on its last. */
const placeInWeek = (day: number, week: WeekInfo) => (day - week.firstDay + 7) % 7

/** First day of the week that contains `date`. */
export function startOfWeek(date: string, week: WeekInfo): string {
  return addDays(date, -placeInWeek(isoDay(date), week))
}

/**
 * First day of the work week a date belongs to: its own week, except a weekend day after the week's last
 * workday, which belongs to the coming week. A weekly plan (lunch menu) made at the weekend is for the week ahead.
 * Monday-first with Sat+Sun off: Saturday and Sunday. Sunday-first with Sat+Sun off: only Saturday.
 */
export function workWeekOf(date: string, week: WeekInfo): string {
  const lastWorkday = Math.max(-1, ...[1, 2, 3, 4, 5, 6, 7].filter((d) => !week.weekend.includes(d)).map((d) => placeInWeek(d, week)))
  const own = startOfWeek(date, week)
  return placeInWeek(isoDay(date), week) > lastWorkday ? addDays(own, 7) : own
}

/**
 * The first day on which `weekStart` is the work week (`workWeekOf`): the day a week planned ahead starts to show.
 * Monday-first with Saturday and Sunday off: the Saturday before.
 */
export function firstDayShown(weekStart: string, week: WeekInfo): string {
  for (let day = addDays(weekStart, -6); day < weekStart; day = addDays(day, 1)) if (workWeekOf(day, week) === weekStart) return day
  return weekStart
}

export function resolveToken(token: string, timeZone: string, week: SiteWeek | undefined, now: Date = new Date()): string | undefined {
  const today = todayIn(timeZone, now)
  if (token === '@today') return today
  if (token === '@workWeek') return workWeekOf(today, weekInfo(week))
  if (token === '@nextWorkWeek') return addDays(workWeekOf(today, weekInfo(week)), 7)
  return undefined
}
