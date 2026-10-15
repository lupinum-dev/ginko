<!-- The weekly opening hours, today's row marked with what applies today (a closure or special hours win), plus the closures still ahead. -->
<script setup lang="ts">
import { hoursOn, spansOf, spansText, timesOf, todayState, upcomingHolidayClosures, upcomingPlans, weekdayOf, weekFor, type DayHours, type Exception, type HolidayClosure, type Weekday } from '../utils/site'

const langOf = useGinkoLang()

const { lang, labels, today } = useSite()
const { t, format } = useI18n()
const { hours, hourPlans, data, plans, ctx } = useHours()

// Special hours are listed only where they apply: a closure over the same day wins (see hoursOn).
const shown = (e: Exception) => spansOf(e).length > 0 && hoursOn(ctx.value, e.when.from).field === `exceptions.${e._id}.reason`
// The week that applies today (a running season replaces the standard week), then the plans that start soon.
const week = computed(() => weekFor(ctx.value, today.value).week)
const coming = computed(() => upcomingPlans(plans.value, today.value, 120))
const ahead = computed(() => [
  ...data.value.exceptions.filter((e) => e.when.to >= today.value && (e.closed || shown(e))),
  ...upcomingHolidayClosures(ctx.value, today.value, 90),
].sort((a, b) => a.when.from.localeCompare(b.when.from)))
const todayKey = computed(() => weekdayOf(today.value))
const reasonOf = (e: Exception | HolidayClosure) => ('holiday' in e ? e.holiday[lang.value] : e.reason)
const special = (e: Exception) => spansText(spansOf(e), t('and'))
const itemOf = (id?: string) => hourPlans.value.items.find((p) => p.id === id)!
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
      <h3>{{ t('fromDate', { date: format.date(c.starts, { day: 'numeric', month: 'long' }) }) }}<template v-if="c.plan.label">: <span :lang="langOf(itemOf(c.plan._id), 'label')">{{ c.plan.label }}</span></template></h3>
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
          <span>
            <span :lang="'holiday' in e ? lang : langOf(hours, `exceptions.${e._id}.reason`)">{{ reasonOf(e) }}</span><template v-if="e.closed">, {{ t('closedFromTo') }}</template><template v-else>, {{ special(e) }}</template>
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
@media (min-width: 720px) { li { grid-template-columns: 18rem 1fr; } }
</style>
