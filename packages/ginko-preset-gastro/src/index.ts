// The public surface, listed on purpose: everything not named here is internal and may change in any release.
// Every name below is described in the README.
export { allergensEU, events, isLunchPlaceholder, gallery, hourPlans, hours, lunch, lunchPlans, menu, menuCategories, notices, type MenuCategory } from './bricks.ts'
export { allergenNames, weekdayNames } from './names.ts'
export {
  closedOnClosure, hoursOn, noticesOn, spansOf, spansText, timesOf, todayState, upcomingClosures, upcomingHolidayClosures, upcomingPlans, weekdayOf, weekFor,
  type DayHours, type DayRule, type Exception, type Holiday, type HolidayClosure, type HoursContext, type HoursData, type HoursSource, type HourPlan, type Span,
  type TodayState, type Weekday,
} from './hours.ts'
export type { HolidayCalendar, HolidaysOption } from './holidays.ts'
export { lunchWeekOn, type LunchWeekData } from './lunch.ts'
export { dishOn } from './menu.ts'
export { priceOn, upcomingPrice, type PricedItem } from './prices.ts'
export { eventJsonLd, restaurantJsonLd, type EventJsonLdInput, type JsonLdMenuSection, type RestaurantJsonLdInput } from './jsonld.ts'
