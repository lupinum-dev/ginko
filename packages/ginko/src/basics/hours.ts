// Opening hours: one rule, `hoursOn`, answers "what applies on day X". Every display builds on it.

import { calendarOfCountry, type StoredHolidays } from '../core/holidays.ts'
import { todayIn } from '../core/time.ts'
import { addDays, weekdayKeys, weekdayOf, type Weekday } from './weekdays.ts'
import { austrianHolidays, calendarOf, type Holiday, type HolidayNames, type HolidaysOption } from './holidays.ts'

export { addDays, weekdayKeys, weekdayOf, type Weekday }
export { austrianHolidays, type Holiday, type HolidayNames }

export interface Times { from1?: string; to1?: string; from2?: string; to2?: string }
export interface DayHours extends Times { day: string; closed: boolean }
/** An exception without times is a closure; with times and `closed: false` it is special hours. */
export interface Exception extends Times {
  _id: string
  when: { from: string; to: string }
  reason: string
  closed: boolean
}
/** A public holiday on which the house is closed, listed with the closures (see `upcomingClosures`). Guests read its name in their language from `holiday`. */
export interface HolidayClosure {
  _id: string
  when: { from: string; to: string }
  closed: true
  holiday: HolidayNames
}
/** A date range with its own week: a season ("yearly") or "new hours from a date". */
export interface HourPlan { _id?: string; id?: string; label?: string; from: string; to?: string; yearly?: boolean; week: DayHours[] }
export type HolidaySetting = 'sunday' | 'closed' | 'normal'
export interface HoursData {
  week: DayHours[]
  exceptions: Exception[]
  closedOn?: string
  closedNote?: string
  holidays?: HolidaySetting
}

export interface Span { from: string; to: string }
export function spansOf(t: Times): Span[] {
  return [[t.from1, t.to1], [t.from2, t.to2]].filter((p): p is [string, string] => !!p[0] && !!p[1]).map(([from, to]) => ({ from, to }))
}
export function spansText(spans: Span[], and: string): string {
  return spans.map((s) => `${s.from}–${s.to}`).join(` ${and} `)
}

/** The opening times of one weekday as text: `11:30–14:00 and 17:30–22:00` with `and` = "and". Empty when closed. */
export function timesOf(day: DayHours | undefined, and: string): string {
  if (!day || day.closed) return ''
  return spansText(spansOf(day), and)
}

/** The public holiday on `date` in `calendar`. */
export function holidayOn(date: string, calendar: HolidaysOption): Holiday | undefined {
  return calendarOf(calendar)(Number(date.slice(0, 4))).find((h) => h.date === date)
}

export type HoursSource = 'today' | 'exception' | 'holiday' | 'plan' | 'week'
export interface DayRule {
  closed: boolean
  times: Span[]
  /** The owner's text: the "closed today" note or the exception's reason. */
  reason?: string
  source: HoursSource
  /** Bundle path of the reason's text, so the page can set its language (closedNote, exception reason). */
  field?: string
  /** Set when a public holiday decided the result: its name in German and English. */
  holiday?: HolidayNames
}
export interface HoursContext {
  hours: HoursData
  plans?: HourPlan[]
  /** Which public holidays count. Code-level config of the site, not an owner setting; wins over `country`. */
  calendar?: HolidaysOption
  /**
   * The site's country (`useRuntimeConfig().public.ginko.country`): its calendar counts when `calendar` is not given.
   * Neither given (or a country without a calendar): no public holidays.
   */
  country?: string
}

/** The calendar of a context: `calendar`, else the one of `country`, else none. */
export function calendarIn(ctx: Pick<HoursContext, 'calendar' | 'country'>): HolidaysOption {
  return ctx.calendar ?? (ctx.country ? calendarOfCountry(ctx.country) : undefined) ?? 'none'
}

function planCovers(plan: HourPlan, date: string): boolean {
  if (date < plan.from) return false
  if (!plan.yearly) return !plan.to || date <= plan.to
  const md = date.slice(5)
  const from = plan.from.slice(5)
  if (!plan.to) return md >= from
  const to = plan.to.slice(5)
  return from <= to ? md >= from && md <= to : md >= from || md <= to
}

/** The plan that applies on `date`: the one with the latest `from` wins. */
export function planOn(plans: HourPlan[] | undefined, date: string): HourPlan | undefined {
  return (plans ?? []).filter((p) => planCovers(p, date)).sort((a, b) => b.from.localeCompare(a.from))[0]
}

/** The 7-day plan that applies on `date`: a covering plan, else the standard week. */
export function weekFor(ctx: HoursContext, date: string): { week: DayHours[]; plan?: HourPlan } {
  const plan = planOn(ctx.plans, date)
  return plan ? { week: plan.week, plan } : { week: ctx.hours.week }
}

function ruleOfDay(day: DayHours | undefined, source: HoursSource): DayRule {
  if (!day || day.closed) return { closed: true, times: [], source }
  return { closed: false, times: spansOf(day), source }
}

/**
 * What applies on `date`. Order: the owner's "closed today" switch, an exception that covers the
 * date (closed, or its own times), a public holiday (by the holiday setting), a plan that covers
 * the date, the standard week.
 */
export function hoursOn(ctx: HoursContext, date: string): DayRule {
  const { hours } = ctx
  if (hours.closedOn === date) return { closed: true, times: [], reason: hours.closedNote || undefined, source: 'today', field: 'closedNote' }

  const covering = (hours.exceptions ?? []).filter((e) => e.when.from <= date && date <= e.when.to && (e.closed || spansOf(e).length > 0))
  const exception = covering.find((e) => e.closed) ?? covering[0]
  if (exception) {
    const field = `exceptions.${exception._id}.reason`
    return exception.closed
      ? { closed: true, times: [], reason: exception.reason, source: 'exception', field }
      : { closed: false, times: spansOf(exception), reason: exception.reason, source: 'exception', field }
  }

  const { week, plan } = weekFor(ctx, date)
  const holiday = holidayOn(date, calendarIn(ctx))
  const setting = hours.holidays ?? 'sunday'
  if (holiday && setting !== 'normal') {
    const base = setting === 'closed' ? undefined : week.find((d) => d.day === 'su')
    return { ...ruleOfDay(base, 'holiday'), holiday: { de: holiday.de, en: holiday.en } }
  }

  return ruleOfDay(week.find((d) => d.day === weekdayOf(date)), plan ? 'plan' : 'week')
}

/** The 7 days from `monday`, each with what applies. */
export function weekOf(ctx: HoursContext, monday: string): Array<DayRule & { date: string; weekday: Weekday }> {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    return { date, weekday: weekdayOf(date), ...hoursOn(ctx, date) }
  })
}

/**
 * `times` are the opening spans; join them with `spansText(times, and)` in the page's language. `field` is the bundle
 * path of the owner's reason, for its language (closedNote or an exception's reason).
 */
export type TodayState =
  | { kind: 'open'; times: Span[]; reason?: string; field?: string }
  | { kind: 'closed'; reason?: string; field: string }
  /** Closed for a public holiday; `holiday` has its name in German and English. */
  | { kind: 'holiday'; holiday: HolidayNames }
  | { kind: 'restDay' }

/** Whether the house is open on `today`, by `hoursOn`. */
export function todayState(ctx: HoursContext, today: string): TodayState {
  const rule = hoursOn(ctx, today)
  if (!rule.closed) return { kind: 'open', times: rule.times, ...(rule.source === 'exception' ? { reason: rule.reason, field: rule.field } : {}) }
  if (rule.source === 'today' || rule.source === 'exception') return { kind: 'closed', reason: rule.reason, field: rule.field ?? '' }
  if (rule.holiday) return { kind: 'holiday', holiday: rule.holiday }
  return { kind: 'restDay' }
}

/**
 * The notices to show on `today`. A notice that ends today (`until` is today) is about today, so a closure today wins
 * over it: on a day the owner closed ("Heute geschlossen" or a closing exception), such a notice ("Heute sind wir
 * ausgebucht.") is left out. Rest days and public holidays do not hide notices, and notices that end later stay.
 */
export function noticesOn<N extends { data: { until?: string | null } }>(notices: readonly N[], ctx: HoursContext, today: string): N[] {
  if (todayState(ctx, today).kind !== 'closed') return [...notices]
  return notices.filter((n) => n.data.until !== today)
}

/** Public holidays on which the house is closed, starting after `today` and within `days` days. */
export function upcomingHolidayClosures(ctx: HoursContext, today: string, days: number): HolidayClosure[] {
  const out: HolidayClosure[] = []
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i)
    const rule = hoursOn(ctx, date)
    if (rule.source === 'holiday' && rule.closed && rule.holiday) {
      out.push({ _id: `holiday-${date}`, when: { from: date, to: date }, closed: true, holiday: rule.holiday })
    }
  }
  return out
}

/**
 * The day set in "closed on" (`closedOn`) as a closure, when it is after `today`: `_id` `'closedOn'`, its note as
 * `reason`, `field` `'closedNote'`. A closure today is today's state (`todayState`); a past day no longer counts.
 */
export function closedOnClosure(hours: Pick<HoursData, 'closedOn' | 'closedNote'>, today: string): (Exception & { field: string }) | undefined {
  const day = hours.closedOn
  return day && day > today ? { _id: 'closedOn', when: { from: day, to: day }, reason: hours.closedNote ?? '', closed: true, field: 'closedNote' } : undefined
}

/**
 * Closures that start after `today` and within `days` days: the owner's closing exceptions, the day set in "closed
 * on" (`closedOnClosure`), and the public holidays that close the house (by `calendarIn(ctx)`). A holiday entry has
 * `holiday` instead of `reason`. An owner's closure has `field`, the bundle path of its reason, so the page can set the
 * reason's language.
 */
export function upcomingClosures(ctx: HoursContext, today: string, days: number): Array<(Exception & { field: string }) | HolidayClosure> {
  const until = addDays(today, days)
  const { hours } = ctx
  const closures: Array<(Exception & { field: string }) | HolidayClosure> = (hours.exceptions ?? [])
    .filter((e) => e.closed && e.when.from > today && e.when.from <= until)
    .map((e) => ({ ...e, field: `exceptions.${e._id}.reason` }))
  const closedOn = closedOnClosure(hours, today)
  if (closedOn && closedOn.when.from <= until) closures.push(closedOn)
  closures.push(...upcomingHolidayClosures(ctx, today, days))
  return closures.sort((a, b) => a.when.from.localeCompare(b.when.from))
}

/** The last day of a plan that starts on `starts`: its `to`, or for a yearly plan the next `to` month-day from there. */
function endOf(plan: HourPlan, starts: string): string | undefined {
  if (!plan.to || !plan.yearly) return plan.to
  const year = Number(starts.slice(0, 4))
  const md = plan.to.slice(5)
  // A season that wraps New Year (November to March) ends in the year after its start.
  return `${md < plan.from.slice(5) ? year + 1 : year}-${md}`
}

/**
 * Plans that start after `today` and within `days` days, with their start date (yearly: next occurrence) and, when the
 * plan has an end, its last day `ends` (yearly: the end of that occurrence).
 */
export function upcomingPlans(plans: HourPlan[], today: string, days: number): Array<{ plan: HourPlan; starts: string; ends?: string }> {
  const until = addDays(today, days)
  const out: Array<{ plan: HourPlan; starts: string; ends?: string }> = []
  for (const plan of plans) {
    let starts = plan.from
    if (plan.yearly) {
      const year = Number(today.slice(0, 4))
      const md = plan.from.slice(5)
      starts = `${year}-${md}` > today ? `${year}-${md}` : `${year + 1}-${md}`
      if (plan.from > starts) starts = plan.from
    }
    const ends = endOf(plan, starts)
    if (starts > today && starts <= until) out.push({ plan, starts, ...(ends ? { ends } : {}) })
  }
  return out.sort((a, b) => a.starts.localeCompare(b.starts))
}

/**
 * Today's line of the hours (the Studio's status, SPEC templates 7.1): the opening ranges, closed (with the owner's
 * reason or the holiday's names), or unknown. Unknown: the data is not hours (no week row for today), an open day has
 * no times, or a site calendar in code (`holidays: 'custom'`) could decide the day and only the site can run it.
 */
export type HoursLine =
  | { state: 'open'; ranges: Array<[from: string, to: string]> }
  | { state: 'closed'; reason?: string | Record<string, string> }
  | { state: 'unknown' }

export interface HoursLineContext {
  /** The site's IANA time zone: "today" is the date there. */
  timeZone: string
  /** Default: the current time. */
  now?: Date
  /** Entries of the hour plans (`hourPlans()`), if the site has them. */
  plans?: HourPlan[]
  /** `schema.holidays`. Absent: no public holidays. */
  holidays?: StoredHolidays
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string | Record<string, string> => typeof v === 'string' ? v !== '' : isRecord(v) && Object.values(v).every((x) => typeof x === 'string')

/** Hours data as the server stores it: a week of day rows, maybe exceptions and a closed day. */
function asHours(data: unknown): HoursData | undefined {
  if (!isRecord(data) || !Array.isArray(data.week) || !data.week.every((d) => isRecord(d) && typeof d.day === 'string')) return undefined
  if (data.exceptions !== undefined && data.exceptions !== null && !(Array.isArray(data.exceptions) && data.exceptions.every((e) => isRecord(e) && isRecord(e.when)))) return undefined
  return { ...data, exceptions: (data.exceptions ?? []) } as unknown as HoursData
}

/** `hours` (the single of `hours()`) today in the site's time zone; see `HoursLine`. */
export function hoursLine(data: unknown, ctx: HoursLineContext): HoursLine {
  const hours = asHours(data)
  if (!hours) return { state: 'unknown' }
  const today = todayIn(ctx.timeZone, ctx.now)
  const custom = ctx.holidays === 'custom'
  const calendar = ctx.holidays === undefined || ctx.holidays === 'custom' ? 'none' : ctx.holidays
  const rule = hoursOn({ hours, plans: ctx.plans, calendar }, today)
  // An owner's rule decides before any holiday; below it, a calendar only the site's code knows could.
  const owner = rule.source === 'today' || rule.source === 'exception'
  if (custom && !owner) return { state: 'unknown' }
  if (rule.source === 'week' || rule.source === 'plan') {
    if (!weekFor({ hours, plans: ctx.plans }, today).week.some((d) => d.day === weekdayOf(today))) return { state: 'unknown' }
  }
  if (rule.closed) {
    const reason: string | Record<string, string> | undefined = rule.holiday ? { ...rule.holiday } : isText(rule.reason) ? rule.reason : undefined
    return reason ? { state: 'closed', reason } : { state: 'closed' }
  }
  const ranges = rule.times.filter((s) => TIME.test(s.from) && TIME.test(s.to)).map((s): [string, string] => [s.from, s.to])
  return ranges.length ? { state: 'open', ranges } : { state: 'unknown' }
}
