// @lupinum/ginko/basics: bricks most sites need, with their rules and JSON-LD (SPEC templates T5). Opt-in, so a site
// that never imports it carries none of it. Every name here is public API; builders for presets are in '/internal'.

// Hours, holidays, notices, events, sessions, gallery (country-aware holidays: T6).
export { hours, hourPlans, type BasicsOptions } from './hours-bricks.ts'
export {
  calendarIn, closedOnClosure, holidayOn, hoursLine, hoursOn, noticesOn, planOn, spansOf, spansText, timesOf, todayState, upcomingClosures,
  upcomingHolidayClosures, upcomingPlans, weekdayOf, weekFor, weekOf,
  type DayHours, type DayRule, type Exception, type HolidayClosure, type HolidaySetting, type HourPlan, type HoursContext, type HoursData,
  type HoursLine, type HoursLineContext, type HoursSource, type Span, type Times, type TodayState, type Weekday,
} from './hours.ts'
export {
  austrianHolidays, calendarOf, germanHolidays, singaporeHolidays,
  type Holiday, type HolidayCalendar, type HolidayCalendarName, type HolidayNames, type HolidaysOption,
} from './holidays.ts'
export { calendarOfCountry, type StoredHolidays } from '../core/holidays.ts'
export { openingHoursJsonLd } from './hours-jsonld.ts'
export { notices } from './notices.ts'
export { events, eventJsonLd, sessions, sessionsInOrder, type EventJsonLdInput, type EventsOptions, type SessionJsonLdInput, type SessionStatus } from './events.ts'
export { gallery } from './gallery.ts'
