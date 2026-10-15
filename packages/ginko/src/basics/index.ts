// @lupinum/ginko/basics: ready-made bricks for the content most sites have, with their schema.org JSON-LD. Each factory
// returns a brick for `bricks` in ginko.config.ts; the components stay in the site. Stored field names never change.
// Every name here is documented on the docs site (Presets page, "Basics").
export type { BasicsOptions } from './shared.ts'
export { site, siteJsonLd, type SiteData, type SiteJsonLdOptions } from './site.ts'
export { legal, legalTypes, type LegalOptions } from './legal.ts'
export { people, personJsonLd, type PersonJsonLdInput } from './people.ts'
export { posts, authors, changelog, postJsonLd, type PostsOptions, type ChangelogOptions, type PostJsonLdInput } from './posts.ts'
export { jobs, jobJsonLd, type JobsOptions, type JobJsonLdInput } from './jobs.ts'
export { faq, faqJsonLd } from './faq.ts'
export { downloads } from './downloads.ts'
// The platform twin of a files config: tools and tests check that a site can move to the Studio.
export { withoutFiles } from '../core/site.ts'

// Hours, holidays, notices, events, sessions, gallery (country-aware holidays: T6).
export { hours, hourPlans } from './hours-bricks.ts'
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
