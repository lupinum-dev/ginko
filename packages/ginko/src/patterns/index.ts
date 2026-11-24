// @lupinum/ginko/patterns: ready-made bricks for the content most sites have (bricks.ts), and the rules and the
// schema.org JSON-LD that read their content. The components stay in the site. Stored field names never change.
// Every name here is documented on the docs site (page "Patterns").
export * from './bricks.ts'
export { siteJsonLd, type SiteData, type SiteJsonLdOptions } from './site.ts'
export { legalTypes } from './legal.ts'
export { personJsonLd, type PersonJsonLdInput } from './people.ts'
export { releaseAnchor, postJsonLd, type PostJsonLdInput } from './posts.ts'
export { jobJsonLd, type JobJsonLdInput } from './jobs.ts'
export { faqJsonLd } from './faq.ts'
export { rssXml, type RssFeed, type RssItem } from './rss.ts'
export { offerJsonLd } from './offer.ts'

// Hours and public holidays.
export {
  calendarIn, closedOnClosure, holidayOn, hoursLine, hoursOn, noticesOn, planOn, spansOf, spansText, timesOf, todayState, upcomingClosures,
  upcomingHolidayClosures, upcomingPlans, weekdayOf, weekFor, weekOf,
  type DayHours, type DayRule, type Exception, type HolidayClosure, type HolidaySetting, type HourPlan, type HoursContext, type HoursData, type WeekHours,
  type HoursLine, type HoursLineContext, type HoursSource, type Span, type Times, type TodayState, type Weekday,
} from './hours.ts'
export {
  austrianHolidays, calendarOf, germanHolidays, singaporeHolidays,
  type Holiday, type HolidayCalendar, type HolidayCalendarName, type HolidayNames, type HolidaysOption,
} from './holidays.ts'
export { calendarOfCountry, type StoredHolidays } from '../core/holidays.ts'
export { openingHoursJsonLd } from './hours-jsonld.ts'
// The status rules, for every caller that checks a schema or computes a Today line (the server, the CLI).
export { statusRules, type StatusRuleName } from './rules.ts'

// Events and their sessions.
export { eventJsonLd, sessionsInOrder, type EventJsonLdInput, type SessionJsonLdInput, type SessionStatus } from './events.ts'
