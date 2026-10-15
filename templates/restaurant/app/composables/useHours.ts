// Synced from templates/_features/hours/app/composables/useHours.ts by `pnpm templates sync`. Edit the source, not this copy.
import {
  calendarOfCountry, hoursLine, hoursOn, upcomingClosures, upcomingPlans, weekFor,
  type DayHours, type HourPlan, type HoursContext, type HoursData, type Weekday,
} from '@lupinum/ginko/basics'

/** The days of the week in storage order. */
const KEYS: Weekday[] = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']
/** The owner's choices for public holidays (`HolidaySetting`). */
const HOLIDAY_SETTINGS = ['sunday', 'closed', 'normal'] as const

/**
 * The opening hours of the site, read once per component: the `hours` single and the `hourPlans` entries, shaped for
 * the rules of `@lupinum/ginko/basics`, with the site's country for public holidays. `now` is the time of the server's
 * render, carried to the browser, so both show the same state; HoursToday moves it on every minute.
 */
export function useHours() {
  const hours = useGinko('hours')
  const hourPlans = useGinko('hourPlans')
  const today = useGinkoToday()
  const locale = useGinkoLocale()
  const { timeZone } = useGinkoSite()
  // `country` of ginko.config.ts (ISO 3166-1, '' when unset): its public holidays count, as in the Studio.
  const country: string = useRuntimeConfig().public.ginko.country
  const now = useState('hours:now', () => Date.now())
  const { firstDay } = useGinkoWeek()

  const data = computed<HoursData>(() => {
    const { week, exceptions, closedOn, closedNote, holidays } = hours.value.data
    return {
      week: week.map((day) => ({ ...day, day: String(day.day), closed: day.closed === true })),
      exceptions: exceptions.map((e) => ({ ...e, reason: e.reason ?? '', closed: e.closed === true })),
      closedOn: closedOn ?? undefined,
      closedNote: closedNote ?? undefined,
      holidays: HOLIDAY_SETTINGS.find((setting) => setting === holidays),
    }
  })
  const plans = computed<HourPlan[]>(() => hourPlans.value.items.map((plan) => ({
    _id: plan.id,
    label: plan.data.label,
    from: plan.data.from,
    to: plan.data.to ?? undefined,
    yearly: plan.data.yearly === true,
    week: plan.data.week.map((day) => ({ ...day, day: String(day.day), closed: day.closed === true })),
  })))
  const ctx = computed<HoursContext>(() => ({ hours: data.value, plans: plans.value, country }))

  const line = computed(() => hoursLine(data.value, { timeZone, now: new Date(now.value), plans: plans.value, holidays: calendarOfCountry(country) ?? 'none' }))
  const yesterday = computed(() => {
    const rule = hoursOn(ctx.value, plusDays(today.value, -1))
    return rule.closed ? [] : rule.times
  })
  const state = computed(() => hoursNow(line.value, clockIn(timeZone, now.value), locale.value, yesterday.value))
  /** Today's opening spans (empty when closed). */
  const todayRule = computed(() => hoursOn(ctx.value, today.value))
  /** The next day after today on which the place opens, within two weeks, with its first opening time. */
  const nextOpen = computed(() => {
    for (let i = 1; i <= 14; i++) {
      const date = plusDays(today.value, i)
      const rule = hoursOn(ctx.value, date)
      if (!rule.closed && rule.times[0]) return { date, from: rule.times[0].from }
    }
    return undefined
  })
  /** The week that applies today (a running season replaces the usual week), in the order of the site's week. */
  const week = computed(() => {
    const { week, plan } = weekFor(ctx.value, today.value)
    const keys = [...KEYS.slice(firstDay - 1), ...KEYS.slice(0, firstDay - 1)]
    return { plan, days: keys.map((key) => week.find((d) => d.day === key) ?? { day: key, closed: true } satisfies DayHours) }
  })
  /** Seasons and new hours that start within 120 days. */
  const comingPlans = computed(() => upcomingPlans(plans.value, today.value, 120))
  /** Closures that run on past today (a holiday that started) and those that start within 90 days (the owner's, a
   *  day set as closed, closing public holidays), the next first. */
  const closures = computed(() => [
    ...data.value.exceptions.filter((e) => e.closed && e.when.from <= today.value && e.when.to > today.value),
    ...upcomingClosures(ctx.value, today.value, 90),
  ])

  return { hours, ctx, now, today, state, todayRule, nextOpen, week, comingPlans, closures }
}
