// Dates in the site's time zone. "Today" never comes from the editor's device (SPEC 2.7, B7).

/** `YYYY-MM-DD` of `now` in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** `YYYY-MM-DDTHH:MM` of `now` on the wall clock of `timeZone` (no seconds, no offset): the form of `$publishAt`. */
export function wallClockIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
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

/**
 * The first instant (ms) whose date in `timeZone` is `day`: its midnight, or, where the clock jumps from 23:59 to 01:00
 * (Havana, Santiago when summer time starts), the instant of the jump. Midnight read with the offset before and after
 * the day starts gives both candidates; the earlier one that already lies in `day` is it.
 */
export function dayStartIn(day: string, timeZone: string): number {
  const naive = Date.parse(`${day}T00:00:00Z`)
  const candidates = [naive - zoneOffset(timeZone, naive - 86_400_000), naive - zoneOffset(timeZone, naive + 86_400_000)].sort((a, b) => a - b)
  return candidates.find((ms) => todayIn(timeZone, new Date(ms)) === day) ?? candidates[1]!
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

/** The keys of the days in the site's week and in stored values (a rows field of weekdays, the opening hours), Monday first. */
export const DAY_KEYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const
export type DayKey = (typeof DAY_KEYS)[number]

/**
 * The site's week, as the site states it (`defineSite({ week })`) and the schema stores it: the day the calendar week
 * starts on and the days that are workdays, any days (`{ firstDay: 'mo', workdays: ['mo', 'tu', 'we', 'th', 'fr'] }`;
 * a restaurant closed on Mondays `['tu', 'we', 'th', 'fr', 'sa']`; a US site `firstDay: 'su'` with Monday to Friday).
 * Every site states it. Weeks start on `firstDay`; after the workday that comes last in the week counted from
 * `firstDay`, the coming week counts.
 */
export interface SiteWeek {
  firstDay: DayKey
  workdays: readonly DayKey[]
}

/** The week a site states, in ISO numbers for the date helpers. */
export function weekInfo(week: SiteWeek): WeekInfo {
  const iso = (day: DayKey) => DAY_KEYS.indexOf(day) + 1
  return { firstDay: iso(week.firstDay) as WeekInfo['firstDay'], weekend: DAY_KEYS.filter((day) => !week.workdays.includes(day)).map(iso) }
}

/** The site's seven days in its order, from `week.firstDay` on. */
export function daysOf(week: SiteWeek): DayKey[] {
  const first = DAY_KEYS.indexOf(week.firstDay)
  return DAY_KEYS.map((_, i) => DAY_KEYS[(first + i) % 7]!)
}

/** The site's workdays in its week order, from `week.firstDay` on. */
export function workdaysOf(week: SiteWeek): DayKey[] {
  return daysOf(week).filter((day) => week.workdays.includes(day))
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

export function resolveToken(token: string, timeZone: string, week: SiteWeek, now: Date = new Date()): string | undefined {
  const today = todayIn(timeZone, now)
  if (token === '@today') return today
  if (token === '@workWeek') return workWeekOf(today, weekInfo(week))
  if (token === '@nextWorkWeek') return addDays(workWeekOf(today, weekInfo(week)), 7)
  return undefined
}
