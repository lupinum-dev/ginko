<!-- The weekly reception hours, today's row marked, plus the exceptions and a "Geschlossen am" day in the next 60 days. -->
<script setup lang="ts">
import { exceptionsAhead, timesOf, weekdayOf, type DayHours, type Exception, type Weekday } from '../utils/site'

const langOf = useGinkoLang()
const { t, format } = useI18n()

const { lang, labels, today } = useSite()
const hours = useGinko('hours')
const week = computed(() => hours.value.data.week as unknown as DayHours[])
const ahead = computed(() => exceptionsAhead(hours.value.data as unknown as { exceptions: Exception[]; closedOn?: string; closedNote?: string }, today.value, 60))
const todayKey = computed(() => weekdayOf(today.value))
</script>

<template>
  <div class="hours">
    <table class="rules">
      <caption class="sr">{{ t('receptionHours') }}</caption>
      <tbody>
        <tr v-for="d in week" :key="d.day" :class="{ today: d.day === todayKey }">
          <th scope="row">{{ labels.weekdays[d.day as Weekday] }}</th>
          <td class="mono">{{ d.closed ? t('closed') : timesOf(d, t('and')) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="ahead.length" class="exceptions">
      <h3>{{ t('comingUp') }}</h3>
      <ul>
        <li v-for="e in ahead" :key="e._id">
          <span class="mono">{{ format.range(e.when.from, e.when.to) }}</span>
          <span><span v-if="e.reason" :lang="langOf(hours, e.field)">{{ e.reason }}</span><template v-if="e.closed">{{ e.reason ? ', ' : '' }}{{ t('closed') }}</template></span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
th { font-weight: 400; width: 10rem; }
td { color: var(--ink-2); }
tr.today th, tr.today td { color: var(--ink); font-weight: 600; }
tr.today th::after { content: ''; display: inline-block; width: 8px; height: 8px; margin-left: 10px; background: var(--signal); }
.exceptions { margin-top: 28px; }
.exceptions h3 { font-size: 1.05rem; margin-bottom: 8px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
li { display: grid; gap: 0 16px; }
@media (min-width: 720px) { li { grid-template-columns: 17rem 1fr; } }
</style>
