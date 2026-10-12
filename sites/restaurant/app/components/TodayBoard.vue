<!-- The "Heute" board: open or closed today, today's lunch, the owner's notices and the next closure.
     It is the one coloured region of the site, the first thing a guest checks at lunchtime. -->
<script setup lang="ts">
import { weekStartOf } from '@lupinum/ginko'
import { spansText, todayState, upcomingClosures, weekdayOf } from '../utils/site'

const { lang, today } = useSite()
const path = usePagePath()
const { t, format } = useI18n()
const notices = useGinko('notices')
const { lunch, current: lunchCurrent } = useLunchWeek()
const { hours, data: h, ctx } = useHours()

const state = computed(() => todayState(today.value, ctx.value))
const closures = computed(() => upcomingClosures(ctx.value, today.value, h.value.holidayNoticeDays))
// Only the menu of the week that contains today counts (a planned week wins); on the weekend the coming week is not today's dish.
const dish = computed(() => {
  if (state.value.kind !== 'open' || !lunchCurrent.value || lunch.value.data.weekOf !== weekStartOf(today.value, useGinkoWeek())) return undefined
  return lunch.value.data.days.find((d) => d.day === weekdayOf(today.value))
})
</script>

<template>
  <section class="board" aria-labelledby="board-title">
    <h2 id="board-title" class="date">{{ format.date(today, { weekday: 'long', day: 'numeric', month: 'long' }) }}</h2>

    <p v-if="state.kind === 'open'" class="status" data-test="status">
      <span class="status-label">{{ t('openToday') }}</span>
      <span class="status-times">{{ spansText(state.times, t('and')) }}</span>
      <span v-if="state.reason" class="status-reason" :lang="state.field ? ginkoLangOf(hours, state.field) : undefined">{{ state.reason }}</span>
    </p>
    <p v-else class="status" data-test="status">
      <span class="status-label">{{ state.kind === 'restDay' ? t('restDay') : t('closedToday') }}</span>
      <span v-if="state.kind === 'holiday'" class="status-reason" data-test="note" :lang="lang">{{ state.holiday[lang] }}</span>
      <span v-else-if="state.kind === 'closed' && state.reason" class="status-reason" data-test="note" :lang="ginkoLangOf(hours, state.field)">{{ state.reason }}</span>
    </p>

    <ul v-if="notices.items.length" class="notices">
      <li v-for="n in notices.items" :key="n.id" data-test="notice" :lang="ginkoLangOf(n, 'text')">{{ n.data.text }}</li>
    </ul>

    <div v-if="dish" class="lunch">
      <h3>{{ t('lunchToday') }}</h3>
      <p class="dish">
        <span :lang="ginkoLangOf(lunch, `days.${dish._id}.dish`)">{{ dish.dish }}</span>
        <span v-if="dish.price" class="price">{{ formatMoney(dish.price, lang) }}</span>
      </p>
      <Allergens :codes="dish.allergens" class="on-dark" />
      <NuxtLink :to="path('lunch')" class="more">{{ t('lunchWeek') }}</NuxtLink>
    </div>

    <p v-for="c in closures" :key="c._id" class="closure">
      {{ t('upcomingClosure') }}: {{ format.range(c.when.from, c.when.to, { day: 'numeric', month: 'long' }) }} {{ t('closedFromTo') }}<template v-if="'holiday' in c"> ({{ c.holiday[lang] }})</template><template v-else-if="c.reason"> (<span :lang="ginkoLangOf(hours, `exceptions.${c._id}.reason`)">{{ c.reason }}</span>)</template>
    </p>
  </section>
</template>

<style scoped>
.board {
  background: var(--linde);
  color: var(--on-linde);
  border-radius: var(--radius);
  padding: 24px 20px 26px;
  display: grid;
  gap: 18px;
}
@media (min-width: 720px) { .board { padding: 32px 32px 34px; } }
.date {
  font-family: var(--sans);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--bluete);
}
.status { display: grid; gap: 2px; }
.status-label {
  font-family: var(--serif);
  font-weight: 700;
  font-size: clamp(1.75rem, 1.5rem + 1vw, 2.25rem);
  line-height: 1.1;
}
.status-times, .status-reason { font-size: 1.2rem; color: var(--on-linde); font-variant-numeric: tabular-nums; }
.notices { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.notices li {
  background: var(--bluete);
  color: var(--ink);
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 700;
}
.lunch { display: grid; gap: 6px; padding-top: 18px; border-top: 1px solid rgb(255 255 255 / 0.18); }
.lunch h3 { font-family: var(--sans); font-size: 1rem; font-weight: 700; color: var(--bluete); letter-spacing: 0; }
.dish { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; font-family: var(--serif); font-size: 1.35rem; font-weight: 500; line-height: 1.25; }
.more { color: var(--on-linde); font-weight: 500; justify-self: start; margin-top: 6px; }
.board :focus-visible { outline-color: var(--bluete); }
.closure { font-size: 1rem; color: var(--on-linde-2); }
.on-dark :deep(abbr) { border-color: rgb(255 255 255 / 0.3); color: var(--on-linde); }
.on-dark :deep(.none) { color: var(--on-linde-2); }
</style>
