<!-- Synced from templates/_features/hours/app/components/hours/Table.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { spansOf, spansText, weekdayOf, type DayHours, type HourPlan } from '@lupinum/ginko/basics'
import { ChevronDown } from '@lucide/vue'

/**
 * The week's opening hours with today marked (today's row says what applies today: a closure or other hours win),
 * the hours that start soon (winter hours, new hours from a date; folded, one line each), the rule for public holidays
 * and the closures ahead. Times in tabular numbers. Place it in a section that gives the heading ("Opening hours").
 */
const { hours, week, today, todayRule, comingPlans, closures, ctx } = useHours()
const { t, format, locale } = useI18n('hours')
const langOf = useGinkoLang()

// 1 January 2024 was a Monday: the weekday names in the page's language from one reference week.
const REFERENCE: Record<string, string> = { mo: '2024-01-01', tu: '2024-01-02', we: '2024-01-03', th: '2024-01-04', fr: '2024-01-05', sa: '2024-01-06', su: '2024-01-07' }
const weekday = (key: string) => format.date(REFERENCE[key] ?? REFERENCE.mo!, { weekday: 'long' })
const todayKey = computed(() => weekdayOf(today.value))
const timesOf = (day: DayHours) => (day.closed || !spansOf(day).length ? t('closed') : spansText(spansOf(day), t('and')))
const todayTimes = computed(() => (todayRule.value.closed ? t('closed') : spansText(todayRule.value.times, t('and'))))
const dayMonth = { day: 'numeric', month: 'long' } as const
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
  const dates = ends ? format.range(starts, ends, dayMonth) : t('from', { date: format.date(starts, dayMonth) })
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
            class="border-b first:border-t aria-[current=date]:bg-muted"
          >
            <th scope="row" class="py-3 ps-3 pe-6 text-start align-baseline font-normal">
              <span :class="day.day === todayKey && 'font-semibold'">{{ weekday(day.day) }}</span>
              <span v-if="day.day === todayKey" class="ms-2 text-small text-muted-foreground">{{ t('today') }}</span>
            </th>
            <td class="py-3 pe-3 text-end align-baseline" :class="day.day === todayKey && 'font-semibold'">
              {{ day.day === todayKey ? todayTimes : timesOf(day) }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="holidayRule" class="text-small text-muted-foreground">{{ holidayRule }}</p>
    </div>

    <details v-for="coming in comingPlans" :key="coming.plan._id ?? coming.starts" class="group flex flex-col gap-3">
      <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
        {{ planTitle(coming.plan, coming.starts, coming.ends) }}
        <ChevronDown class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <table class="mt-2 w-full text-small tabular-nums">
        <caption class="sr-only">{{ planTitle(coming.plan, coming.starts, coming.ends) }}</caption>
        <tbody>
          <tr v-for="day in coming.plan.week" :key="day.day" class="border-b first:border-t">
            <th scope="row" class="py-2 ps-3 pe-6 text-start font-normal">{{ weekday(day.day) }}</th>
            <td class="py-2 pe-3 text-end">{{ timesOf(day) }}</td>
          </tr>
        </tbody>
      </table>
    </details>

    <div v-if="closures.length" class="flex flex-col gap-3">
      <h3 class="text-body font-semibold">{{ t('closures') }}</h3>
      <ul class="flex flex-col">
        <li v-for="closure in closures" :key="closure._id" class="flex flex-wrap justify-between gap-x-6 border-b py-2 first:border-t">
          <span class="tabular-nums">{{ format.range(closure.when.from, closure.when.to, dayMonth) }}</span>
          <span class="text-muted-foreground"><span :lang="reasonLang(closure)">{{ reasonOf(closure) || t('closedDays') }}</span></span>
        </li>
      </ul>
    </div>
  </div>
</template>
