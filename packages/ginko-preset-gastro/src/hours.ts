// Opening hours: one rule, `hoursOn`, answers "what applies on day X". Every display builds on it.

import { addDays, weekdayKeys, weekdayOf, type Weekday } from './dates.ts'
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
  /** Set on a synthetic entry for a public holiday (see `upcomingClosures`). */
  names?: HolidayNames
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

/** The opening times of one weekday as text: `11:30–14:00 und 17:30–22:00`. Empty when closed. */
export function timesOf(day: DayHours | undefined, and: string): string {
  if (!day || day.closed) return ''
  return spansText(spansOf(day), and)
}

/** The public holiday on `date` in `calendar` (default: Austria). */
export function holidayOn(date: string, calendar: HolidaysOption = 'AT'): Holiday | undefined {
  return calendarOf(calendar)(Number(date.slice(0, 4))).find((h) => h.date === date)
}

export type HoursSource = 'today' | 'exception' | 'holiday' | 'plan' | 'week'
export interface DayRule {
  closed: boolean
  times: Span[]
  reason?: string
  source: HoursSource
  /** Bundle path of the reason's text, so the page can set its language (closedNote, exception reason). */
  field?: string
  /** Set when a public holiday decided the result. */
  holiday?: HolidayNames
}
export interface HoursContext {
  hours: HoursData
  plans?: HourPlan[]
  /** Which public holidays count. Code-level config of the site, not an owner setting; absent means Austria. */
  calendar?: HolidaysOption
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
export function weekFor(date: string, ctx: HoursContext): { week: DayHours[]; plan?: HourPlan } {
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
export function hoursOn(date: string, ctx: HoursContext): DayRule {
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

  const { week, plan } = weekFor(date, ctx)
  const holiday = holidayOn(date, ctx.calendar)
  const setting = hours.holidays ?? 'sunday'
  if (holiday && setting !== 'normal') {
    const base = setting === 'closed' ? undefined : week.find((d) => d.day === 'su')
    return { ...ruleOfDay(base, 'holiday'), reason: holiday.de, holiday: { de: holiday.de, en: holiday.en } }
  }

  return ruleOfDay(week.find((d) => d.day === weekdayOf(date)), plan ? 'plan' : 'week')
}

/** The 7 days from `monday`, each with what applies. */
export function weekOf(monday: string, ctx: HoursContext): Array<DayRule & { date: string; weekday: Weekday }> {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    return { date, weekday: weekdayOf(date), ...hoursOn(date, ctx) }
  })
}

export type TodayState =
  | { kind: 'open'; times: string; reason?: string; field?: string }
  /** `field` is the bundle path of the reason, for its language (closedNote or an exception's reason); empty for a holiday, which carries `names`. */
  | { kind: 'closed'; reason?: string; field: string; names?: HolidayNames }
  | { kind: 'restDay' }

/** Whether the house is open today, by `hoursOn`. */
export function todayState(hours: HoursData, today: string, and: string, plans: HourPlan[] = [], calendar?: HolidaysOption): TodayState {
  const rule = hoursOn(today, { hours, plans, calendar })
  if (!rule.closed) return { kind: 'open', times: spansText(rule.times, and), ...(rule.source === 'exception' ? { reason: rule.reason, field: rule.field } : {}) }
  if (rule.source === 'today' || rule.source === 'exception') return { kind: 'closed', reason: rule.reason, field: rule.field ?? '' }
  if (rule.holiday) return { kind: 'closed', reason: rule.reason, field: '', names: rule.holiday }
  return { kind: 'restDay' }
}

/** Public holidays on which the house is closed, starting after `today` and within `days` days. */
export function upcomingHolidayClosures(ctx: HoursContext, today: string, days: number): Exception[] {
  const out: Exception[] = []
  for (let i = 1; i <= days; i++) {
    const date = addDays(today, i)
    const rule = hoursOn(date, ctx)
    if (rule.source === 'holiday' && rule.closed && rule.holiday) {
      out.push({ _id: `holiday-${date}`, when: { from: date, to: date }, reason: rule.holiday.de, closed: true, names: rule.holiday })
    }
  }
  return out
}

/**
 * Closures that start within `days` days from today and have not started yet. With `ctx`, public
 * holidays that close the house are listed too.
 */
export function upcomingClosures(exceptions: Exception[], today: string, days: number, ctx?: HoursContext): Exception[] {
  const until = addDays(today, days)
  const closures = exceptions.filter((e) => e.closed && e.when.from > today && e.when.from <= until)
  if (ctx) closures.push(...upcomingHolidayClosures(ctx, today, days))
  return closures.sort((a, b) => a.when.from.localeCompare(b.when.from))
}

/** Plans that start after `today` and within `days` days, with their start date (yearly: next occurrence). */
export function upcomingPlans(plans: HourPlan[], today: string, days: number): Array<{ plan: HourPlan; starts: string }> {
  const until = addDays(today, days)
  const out: Array<{ plan: HourPlan; starts: string }> = []
  for (const plan of plans) {
    let starts = plan.from
    if (plan.yearly) {
      const year = Number(today.slice(0, 4))
      const md = plan.from.slice(5)
      starts = `${year}-${md}` > today ? `${year}-${md}` : `${year + 1}-${md}`
      if (plan.from > starts) starts = plan.from
    }
    if (starts > today && starts <= until) out.push({ plan, starts })
  }
  return out.sort((a, b) => a.starts.localeCompare(b.starts))
}
