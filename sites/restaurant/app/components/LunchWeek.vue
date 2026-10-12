<!-- The lunch menu of the week: 5 days from the week start. Today's row is marked. Shown only for the current work week (on the weekend: the coming one). -->
<script setup lang="ts">
import { lunchPrintPath, type Weekday } from '../utils/site'

const { lang, labels } = useSite()
const { t, format } = useI18n()
const { lunch, current, todayKey } = useLunchWeek()
</script>

<template>
  <div v-if="current">
    <p class="week">{{ t('weekOf', { date: format.date(lunch.data.weekOf, { day: 'numeric', month: 'long' }) }) }}. {{ t('lunchHint') }}.</p>
    <ol class="days">
      <li v-for="d in lunch.data.days" :key="d._id" :class="{ today: d.day === todayKey }" data-test="lunch" :aria-current="d.day === todayKey ? 'date' : undefined">
        <span class="day">{{ labels.weekdays[d.day as Weekday] }}<span v-if="d.day === todayKey" class="tag">{{ t('today') }}</span></span>
        <span class="dish" :lang="ginkoLangOf(lunch, `days.${d._id}.dish`)">{{ d.dish }}</span>
        <span class="meta">
          <Allergens :codes="d.allergens" />
          <span v-if="d.price" class="price">{{ formatMoney(d.price, lang) }}</span>
        </span>
      </li>
    </ol>
    <p v-if="lunch.data.note" class="note" :lang="ginkoLangOf(lunch, 'note')">{{ lunch.data.note }}</p>
    <p class="print-link"><NuxtLink :to="lunchPrintPath(lang)">{{ t('printLink') }}</NuxtLink></p>
    <AllergenKey :codes="lunch.data.days.flatMap((d) => d.allergens)" />
  </div>
  <p v-else class="lede">{{ t('lunchPending') }}</p>
</template>

<style scoped>
.week { color: var(--ink-2); margin-bottom: 12px; }
.days { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
.days li {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px 24px;
  padding: 14px 0;
  border-bottom: 1px solid var(--rule);
}
.day { font-size: 0.95rem; font-weight: 700; color: var(--ink-2); }
.today .day { color: var(--linde-ink); }
.tag { margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: var(--linde); color: var(--on-linde); font-size: 0.8rem; }
.dish { font-family: var(--serif); font-size: 1.25rem; font-weight: 500; line-height: 1.3; }
.meta { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.note { margin-top: 14px; color: var(--ink-2); }
.print-link { margin-top: 14px; font-size: 1rem; }
@media print { .print-link { display: none; } }
@media (min-width: 720px) {
  .days li { grid-template-columns: 8rem 1fr auto; align-items: baseline; padding: 16px 0; }
  .meta { justify-content: flex-end; }
  .price { min-width: 5.5rem; text-align: right; }
}
.today { background: linear-gradient(var(--paper-2), var(--paper-2)) no-repeat; background-size: 100% 100%; box-shadow: -12px 0 0 var(--paper-2), 12px 0 0 var(--paper-2); }
</style>
