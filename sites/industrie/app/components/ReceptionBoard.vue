<!-- Reception today: staffed with times, closed with a reason, or weekend. Next to it the address and phone. -->
<script setup lang="ts">
import { telHref, todayState, type DayHours, type Exception } from '../utils/site'
const { t, format } = useI18n()

const { lang, today } = useSite()
const hours = useGinko('hours')
const company = useGinko('company')

const h = computed(() => hours.value.data as unknown as { week: DayHours[]; exceptions: Exception[]; closedOn?: string; closedNote?: string })
const state = computed(() => todayState(h.value, today.value, t('and')))
</script>

<template>
  <div class="board">
    <div class="today">
      <p class="date mono">{{ format.date(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</p>
      <p v-if="state.kind === 'open'" class="status" data-test="status">
        <span class="label">{{ t('openToday') }}</span>
        <span class="times mono">{{ state.times }}</span>
      </p>
      <p v-else class="status" data-test="status">
        <span class="label">{{ state.kind === 'weekend' ? t('weekend') : t('closedToday') }}</span>
        <span v-if="state.kind === 'closed' && state.reason" class="reason" data-test="note" :lang="langOf(hours, state.field)">{{ state.reason }}</span>
      </p>
    </div>
    <address class="address">
      <span>{{ company.data.street }}</span>
      <span>{{ company.data.city }}</span>
      <a :href="telHref(company.data.phone)" class="mono">{{ company.data.phone }}</a>
    </address>
  </div>
</template>

<style scoped>
.board {
  display: grid;
  gap: 24px;
  padding: 24px;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
}
.date { font-size: 0.9rem; color: var(--ink-2); }
.status { display: grid; gap: 4px; margin-top: 8px; }
.label { font-size: 1.4rem; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
.label::before { content: ''; display: inline-block; width: 8px; height: 8px; margin-right: 10px; background: var(--signal); vertical-align: middle; position: relative; top: -2px; }
.times { font-size: 1.05rem; }
.reason { color: var(--ink-2); }
.address { display: grid; gap: 2px; font-style: normal; align-content: start; }
@media (min-width: 720px) {
  .board { grid-template-columns: 1fr 1fr; gap: 48px; padding: 28px 32px; }
  .address { border-left: 1px solid var(--rule); padding-left: 32px; }
}
</style>
