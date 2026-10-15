// Dates in the site's time zone. "Today" never comes from the editor's device (SPEC 2.7, B7).

/** `YYYY-MM-DD` of `now` in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
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

/** Used when the runtime knows no week data, and for stored schemas that have no `week` yet. */
export const DEFAULT_WEEK: WeekInfo = { firstDay: 1, weekend: [6, 7] }

/**
 * Week info of a BCP 47 language (`de-AT`, `en-US`) from the runtime's locale data. `firstDayOfWeek` is the site
 * owner's override of the first day. Computed once when the schema is built; everything else reads `schema.week`.
 */
export function weekInfoOf(language: string, firstDayOfWeek?: WeekInfo['firstDay']): WeekInfo {
  let info: WeekInfo = DEFAULT_WEEK
  try {
    const locale = new Intl.Locale(language) as Intl.Locale & { getWeekInfo?: () => Partial<WeekInfo>; weekInfo?: Partial<WeekInfo> }
    const found = locale.getWeekInfo?.() ?? locale.weekInfo
    if (found?.firstDay && Array.isArray(found.weekend)) info = { firstDay: found.firstDay as WeekInfo['firstDay'], weekend: [...found.weekend] }
  } catch { /* invalid tag: checkSite reports it */ }
  return { firstDay: firstDayOfWeek ?? info.firstDay, weekend: info.weekend }
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

export function resolveToken(token: string, timeZone: string, week: WeekInfo, now: Date = new Date()): string | undefined {
  const today = todayIn(timeZone, now)
  if (token === '@today') return today
  if (token === '@workWeek') return workWeekOf(today, week)
  if (token === '@nextWorkWeek') return addDays(workWeekOf(today, week), 7)
  return undefined
}
