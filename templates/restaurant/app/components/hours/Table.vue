<!-- Synced from templates/_features/hours/app/components/hours/Table.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { spansOf, weekdayOf, type DayHours, type HourPlan } from '@lupinum/ginko/basics'
import { ChevronDown } from '@lucide/vue'

/**
 * The week's opening hours with today in bold and the word "Today" (no background: the rows already have lines; today's
 * row says what applies today, a closure or other hours win), the hours that start soon (winter hours, new hours from a
 * date; folded, one line each), the rule for public holidays and the closures ahead (a single day with its weekday,
 * flush with the rows of the week). Times in tabular numbers; a span never breaks across lines. Place it in a section that gives
 * the heading ("Opening hours"); `level` is the heading level of "Closures" inside it (default 3, under an h2).
 */
const props = withDefaults(defineProps<{ level?: 3 | 4 }>(), { level: 3 })
const { hours, week, today, todayRule, comingPlans, closures, ctx } = useHours()
const { t, format, locale } = useI18n('hours')
const langOf = useGinkoLang()

// 1 January 2024 was a Monday: the weekday names in the page's language from one reference week.
const REFERENCE: Record<string, string> = { mo: '2024-01-01', tu: '2024-01-02', we: '2024-01-03', th: '2024-01-04', fr: '2024-01-05', sa: '2024-01-06', su: '2024-01-07' }
const weekday = (key: string) => format.date(REFERENCE[key] ?? REFERENCE.mo!, { weekday: 'long' })
const todayKey = computed(() => weekdayOf(today.value))
// One entry per time range: the cell shows each on its own line (the "and" join stays in the one-line readers).
const timesOf = (day: DayHours) => (day.closed || !spansOf(day).length ? [t('closed')] : spanLines(spansOf(day)))
const todayTimes = computed(() => (todayRule.value.closed ? [t('closed')] : spanLines(todayRule.value.times)))
const dayMonth = { day: 'numeric', month: 'long' } as const
/** Two dates as a range: Intl's short form in one year ("1–15 November"); across a year each date in full, joined by
 *  a spaced dash ("1 November 2026 – 31 March 2027"; Intl writes "01 novembre" in Italian there). */
const dateRange = (from: string, to: string) => {
  if (from.slice(0, 4) === to.slice(0, 4)) return format.range(from, to, dayMonth)
  const full = { ...dayMonth, year: 'numeric' } as const
  return `${format.date(from, full)} – ${format.date(to, full)}`
}
/** A closure's dates; a single day with its weekday ("Fri 27 November"), so the visitor sees which day is lost. */
const closureDates = (from: string, to: string) => (from === to ? format.date(from, { weekday: 'short', ...dayMonth }) : dateRange(from, to))
const holidayRule = computed(() => {
  const rule = ctx.value.hours.holidays ?? 'sunday'
  return rule === 'normal' ? undefined : t(rule === 'closed' ? 'holidays.closed' : 'holidays.sunday')
})
// A season that runs today, with its end (a yearly season: this year's end, which may be next year).
const season = computed(() => {
  const plan = week.value.plan
  const end = comingEnd(plan)
  if (!plan || !end) return plan?.label
  const date = format.date(end, dayMonth)
  return plan.label ? t('season', { name: plan.label, date }) : t('seasonUnnamed', { date })
})
function comingEnd(plan: HourPlan | undefined) {
  if (!plan?.to) return undefined
  if (!plan.yearly) return plan.to
  const md = plan.to.slice(5)
  const year = Number(today.value.slice(0, 4))
  return `${today.value.slice(5) > md ? year + 1 : year}-${md}`
}
const planTitle = (plan: HourPlan, starts: string, ends?: string) => {
  const dates = ends ? dateRange(starts, ends) : t('from', { date: format.date(starts, dayMonth) })
  return plan.label ? `${dates}: ${plan.label}` : dates
}
const reasonOf = (closure: (typeof closures.value)[number]) => {
  if ('holiday' in closure) return locale.value === 'de' || locale.value === 'en' ? closure.holiday[locale.value] : t('holiday')
  return closure.reason
}
const reasonLang = (closure: (typeof closures.value)[number]) => ('holiday' in closure ? undefined : langOf(hours.value, `exceptions.${closure._id}.reason`))
</script>

<template>
  <div class="flex flex-col gap-10">
    <div class="flex flex-col gap-3">
      <p v-if="week.plan" class="text-small text-muted-foreground">
        {{ season }}
      </p>
      <table class="w-full tabular-nums">
        <caption class="sr-only">{{ t('title') }}</caption>
        <tbody>
          <tr
            v-for="day in week.days"
            :key="day.day"
            :aria-current="day.day === todayKey ? 'date' : undefined"
            class="border-b first:border-t"
          >
            <th scope="row" class="py-3 pe-6 text-start align-baseline font-normal">
              <span :class="day.day === todayKey && 'font-semibold'">{{ weekday(day.day) }}</span>
              <span v-if="day.day === todayKey" class="ms-2 text-small text-muted-foreground">{{ t('today') }}</span>
            </th>
            <td class="py-3 text-end align-baseline" :class="day.day === todayKey && 'font-semibold'">
              <span v-for="line in (day.day === todayKey ? todayTimes : timesOf(day))" :key="line" class="block whitespace-nowrap">{{ line }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="holidayRule" class="text-small text-muted-foreground">{{ holidayRule }}</p>
    </div>

    <details v-for="coming in comingPlans" :key="coming.plan._id ?? coming.starts" class="group flex flex-col gap-3">
      <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold tabular-nums [&::-webkit-details-marker]:hidden">
        {{ planTitle(coming.plan, coming.starts, coming.ends) }}
        <ChevronDown class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <table class="mt-2 w-full text-small tabular-nums">
        <caption class="sr-only">{{ planTitle(coming.plan, coming.starts, coming.ends) }}</caption>
        <tbody>
          <tr v-for="day in coming.plan.week" :key="day.day" class="border-b first:border-t">
            <th scope="row" class="py-2 pe-6 text-start font-normal">{{ weekday(day.day) }}</th>
            <td class="py-2 text-end"><span v-for="line in timesOf(day)" :key="line" class="block whitespace-nowrap">{{ line }}</span></td>
          </tr>
        </tbody>
      </table>
    </details>

    <div v-if="closures.length" class="flex flex-col gap-3">
      <component :is="`h${props.level}`" class="text-body font-semibold">{{ t('closures') }}</component>
      <ul class="flex flex-col">
        <li v-for="closure in closures" :key="closure._id" class="flex flex-wrap justify-between gap-x-6 border-b py-2 first:border-t">
          <span class="tabular-nums">{{ closureDates(closure.when.from, closure.when.to) }}</span>
          <span class="text-muted-foreground"><span :lang="reasonLang(closure)">{{ reasonOf(closure) || t('closedDays') }}</span></span>
        </li>
      </ul>
    </div>
  </div>
</template>
