<script setup lang="ts">
import { sheetTimes, sheetTotal } from '../utils/site'

// A fixed sample time sheet: shows what a week of clock-ins looks like. Not content; its texts are the site's own.
const { labels } = useSite()
const { t } = useI18n()
</script>

<template>
  <aside class="clock" :aria-label="t('stempeluhr')">
    <div class="bar">
      <span class="title">{{ t('stempeluhr') }}</span>
      <span class="week">{{ t('week') }}</span>
    </div>
    <table class="rows">
      <tbody>
        <tr v-for="(row, i) in labels.sheetRows" :key="row.day">
          <th scope="row">{{ row.day }}</th>
          <td class="span">{{ sheetTimes[i]!.from }}–{{ sheetTimes[i]!.to }}</td>
          <td class="place">{{ row.place }}</td>
          <td class="net">{{ sheetTimes[i]!.net }}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colspan="3">{{ t('sheetTotal') }}</th>
          <td class="net">{{ sheetTotal }} {{ t('hoursUnit') }}</td>
        </tr>
      </tfoot>
    </table>
    <p class="note">{{ t('sheetBreak') }}</p>
  </aside>
</template>

<style scoped>
.clock {
  background: var(--surface);
  border: var(--line) solid var(--ink);
  border-radius: var(--radius);
  font-family: var(--mono);
  font-size: 0.88rem;
  line-height: 1.5;
  box-shadow: 6px 6px 0 var(--ink);
}
.bar { display: flex; justify-content: space-between; padding: 10px 16px; background: var(--ink); color: var(--paper); font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; font-size: 0.8rem; }
.rows { width: 100%; border-collapse: collapse; }
.rows th, .rows td { padding: 10px 6px; text-align: left; vertical-align: top; border-bottom: 1.5px solid var(--rule); font-weight: 400; }
.rows th:first-child, .rows td:first-child { padding-left: 16px; }
.rows th { font-weight: 500; }
.rows .net { text-align: right; padding-right: 16px; font-weight: 500; white-space: nowrap; }
.rows .span { white-space: nowrap; }
tfoot th, tfoot td { border-bottom: 0; border-top: 1.5px solid var(--ink); font-weight: 500; }
.note { padding: 10px 16px 14px; color: var(--ink-2); font-size: 0.8rem; }
</style>
