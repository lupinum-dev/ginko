<!-- The weekly opening hours, today's row marked with what applies today (a closure or special hours win), plus the closures still ahead. -->
<script setup lang="ts">
import { closedOnClosure, hoursOn, spansOf, spansText, timesOf, todayState, upcomingHolidayClosures, upcomingPlans, weekdayOf, weekFor, type DayHours, type Exception, type HolidayClosure, type Weekday } from '../utils/site'

const langOf = useGinkoLang()

const { lang, labels, today } = useSite()
const { t, format } = useI18n()
const { hours, hourPlans, data, plans, ctx } = useHours()

// Special hours are listed only where they apply: a closure over the same day wins (see hoursOn).
const shown = (e: Exception) => spansOf(e).length > 0 && hoursOn(ctx.value, e.when.from).field === `exceptions.${e._id}.reason`
// The week that applies today (a running season replaces the standard week), then the plans that start soon, each
// headed with its dates (a season with its end, "new hours from a date" with its start only).
const week = computed(() => weekFor(ctx.value, today.value).week)
const coming = computed(() => upcomingPlans(plans.value, today.value, 120))
// A day set in "Geschlossen am" (closedOn) after today is listed like a closure; today's row shows today's.
const closedOn = computed(() => closedOnClosure(data.value, today.value))
const ahead = computed<Array<(Exception & { field?: string }) | HolidayClosure>>(() => [
  ...data.value.exceptions.filter((e) => e.when.to >= today.value && (e.closed || shown(e))),
  ...(closedOn.value ? [closedOn.value] : []),
  ...upcomingHolidayClosures(ctx.value, today.value, 90),
].sort((a, b) => a.when.from.localeCompare(b.when.from)))
const todayKey = computed(() => weekdayOf(today.value))
const reasonOf = (e: Exception | HolidayClosure) => ('holiday' in e ? e.holiday[lang.value] : e.reason)
const reasonLang = (e: (Exception & { field?: string }) | HolidayClosure) => ('holiday' in e ? lang.value : langOf(hours.value, e.field ?? `exceptions.${e._id}.reason`))
const special = (e: Exception) => spansText(spansOf(e), t('and'))
const itemOf = (id?: string) => hourPlans.value.items.find((p) => p.id === id)!
const dayMonth = { day: 'numeric', month: 'long' } as const
// A season's dates wrap only after the dash, never inside a date ("1. November 2026–" / "31. März 2027" on a phone).
const planDates = (c: { starts: string; ends?: string }) => (c.ends ? format.range(c.starts, c.ends, dayMonth).replace(/ /g, '\u00a0') : t('fromDate', { date: format.date(c.starts, dayMonth) }))
const cell = (d: DayHours) => (d.closed ? t('closedDay') : timesOf(d, t('and')))
// Today's row says what applies today, by the same rule as the Heute board: a closure, a holiday or special hours.
const todayCell = computed(() => {
  const state = todayState(ctx.value, today.value)
  if (state.kind === 'open') return spansText(state.times, t('and'))
  return state.kind === 'restDay' ? t('closedDay') : t('closedToday')
})
</script>

<template>
  <div class="hours">
    <table>
      <caption class="sr">{{ t('hours') }}</caption>
      <tbody>
        <tr v-for="d in week" :key="d.day" :class="{ today: d.day === todayKey }">
          <th scope="row">{{ labels.weekdays[d.day as Weekday] }}</th>
          <td>{{ d.day === todayKey ? todayCell : cell(d) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-for="c in coming" :key="c.plan._id" class="plan">
      <h3>{{ planDates(c) }}<template v-if="c.plan.label">: <span :lang="langOf(itemOf(c.plan._id), 'label')">{{ c.plan.label }}</span></template></h3>
      <table>
        <tbody>
          <tr v-for="d in c.plan.week" :key="d.day">
            <th scope="row">{{ labels.weekdays[d.day as Weekday] }}</th>
            <td>{{ cell(d) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="ahead.length" class="exceptions">
      <h3>{{ t('exceptions') }}</h3>
      <ul>
        <li v-for="e in ahead" :key="e._id">
          <span class="when">{{ format.range(e.when.from, e.when.to) }}</span>
          <!-- The owner's reason and the state on their own lines: a reason is free text and may end in a full stop. -->
          <span class="what">
            <span v-if="reasonOf(e)" :lang="reasonLang(e)">{{ reasonOf(e) }}</span>
            <span class="state">{{ e.closed ? t('closed') : special(e) }}</span>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 9px 0; border-bottom: 1px solid var(--rule); vertical-align: baseline; }
th { font-weight: 500; padding-right: 16px; width: 9rem; }
td { color: var(--ink-2); }
tr.today th, tr.today td { color: var(--ink); font-weight: 700; }
tr.today th::after { content: ''; display: inline-block; width: 8px; height: 8px; margin-left: 8px; border-radius: 50%; background: var(--linde); vertical-align: middle; }
.plan { margin-top: 28px; }
.plan h3 { font-size: 1.25rem; margin-bottom: 8px; }
.exceptions { margin-top: 28px; }
.exceptions h3 { font-size: 1.25rem; margin-bottom: 8px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
li { display: grid; gap: 0 16px; }
.when { font-weight: 700; }
.what > span { display: block; }
.state { color: var(--ink-2); }
@media (min-width: 720px) { li { grid-template-columns: 18rem 1fr; } }
</style>
