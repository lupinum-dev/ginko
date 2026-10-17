// Opening hours: the rules live in `@lupinum/ginko/basics`. The preset keeps its 0.4 default: a site that gives the
// rules neither `calendar` nor `country` keeps the Austrian public holidays.
import * as basics from '@lupinum/ginko/basics'
import type { DayRule, Exception, Holiday, HolidayClosure, HolidaysOption, HoursContext, TodayState, Weekday } from '@lupinum/ginko/basics'

export {
  austrianHolidays, closedOnClosure, planOn, spansOf, spansText, timesOf, upcomingPlans, weekdayOf, weekFor,
  type DayHours, type DayRule, type Exception, type Holiday, type HolidayClosure, type HolidayNames, type HolidaySetting, type HourPlan,
  type HoursContext, type HoursData, type HoursSource, type Span, type Times, type TodayState, type Weekday,
} from '@lupinum/ginko/basics'

/** The context with Austria as the calendar when it names none (the preset's 0.4 behaviour). */
const withDefault = (ctx: HoursContext): HoursContext => (ctx.calendar !== undefined || ctx.country ? ctx : { ...ctx, calendar: 'AT' })

/** The public holiday on `date` in `calendar` (default: Austria). */
export function holidayOn(date: string, calendar: HolidaysOption = 'AT'): Holiday | undefined {
  return basics.holidayOn(date, calendar)
}

/** What applies on `date` (see the basics `hoursOn`); without `calendar` or `country`, Austrian holidays count. */
export function hoursOn(ctx: HoursContext, date: string): DayRule {
  return basics.hoursOn(withDefault(ctx), date)
}

/** The 7 days from `monday`, each with what applies. */
export function weekOf(ctx: HoursContext, monday: string): Array<DayRule & { date: string; weekday: Weekday }> {
  return basics.weekOf(withDefault(ctx), monday)
}

/** Whether the house is open on `today`, by `hoursOn`. */
export function todayState(ctx: HoursContext, today: string): TodayState {
  return basics.todayState(withDefault(ctx), today)
}

/** The notices to show on `today` (see the basics `noticesOn`). */
export function noticesOn<N extends { data: { until?: string | null } }>(notices: readonly N[], ctx: HoursContext, today: string): N[] {
  return basics.noticesOn(notices, withDefault(ctx), today)
}

/** Public holidays on which the house is closed, starting after `today` and within `days` days. */
export function upcomingHolidayClosures(ctx: HoursContext, today: string, days: number): HolidayClosure[] {
  return basics.upcomingHolidayClosures(withDefault(ctx), today, days)
}

/** Closures that start after `today` and within `days` days (see the basics `upcomingClosures`). */
export function upcomingClosures(ctx: HoursContext, today: string, days: number): Array<(Exception & { field: string }) | HolidayClosure> {
  return basics.upcomingClosures(withDefault(ctx), today, days)
}

/** @internal The preset's default for code that passes a context on (JSON-LD). */
export { withDefault }
