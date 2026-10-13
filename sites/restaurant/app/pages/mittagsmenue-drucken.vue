<script setup lang="ts">
// The lunch week as one A4 page for the door. Same data and pending rule as the lunch page; a week that is
// not the current one prints nothing but the pending text, so no old menu goes on the door by mistake.
import { formatMoney } from '@lupinum/ginko'
import { siteName, telHref, type Weekday } from '../utils/site'

const langOf = useGinkoLang()

definePageMeta({ layout: 'print', path: '/mittagsmenue/drucken', i18n: { paths: { en: '/lunch/print' } } })

const { lang, labels } = useSite()
const { t, format } = useI18n()
const path = useGinkoPath()
const { lunch, current } = useLunchWeek()
const contact = useGinko('contact')
const print = () => window.print()

useSeoMeta({ title: () => `${t('printTitle')} | ${siteName}`, robots: 'noindex, nofollow' })

// The 5 lunch days from the week start, e.g. "12. bis 16. Oktober 2026".
const range = computed(() => {
  const [y, m, d] = lunch.value.data.weekOf.split('-').map(Number) as [number, number, number]
  const friday = new Date(Date.UTC(y, m - 1, d + 4)).toISOString().slice(0, 10)
  const sameMonth = lunch.value.data.weekOf.slice(0, 7) === friday.slice(0, 7)
  return t('weekRange', {
    from: sameMonth ? `${Number(lunch.value.data.weekOf.slice(8))}${lang.value === 'de' ? '.' : ''}` : format.date(lunch.value.data.weekOf, { day: 'numeric', month: 'long' }),
    to: format.date(friday, { day: 'numeric', month: 'long', year: 'numeric' }),
  })
})
</script>

<template>
  <div class="sheet">
    <div class="screen-only bar">
      <NuxtLink :to="path('lunch')">{{ t('backToLunch') }}</NuxtLink>
      <button v-if="current" type="button" class="button" data-test="print-button" @click="print">{{ t('print') }}</button>
    </div>

    <header class="head">
      <LindenLeaf class="leaf" />
      <p class="house">{{ siteName }}</p>
    </header>

    <main>
      <h1>{{ t('lunchWeek') }}</h1>
      <template v-if="current">
        <p class="range" data-test="print-week">{{ range }}</p>
        <p class="hint">{{ t('lunchHint') }}</p>
        <ol class="days">
          <li v-for="d in lunch.data.days" :key="d._id" data-test="print-day">
            <span class="day">{{ labels.weekdays[d.day as Weekday] }}</span>
            <span class="dish" :lang="langOf(lunch, `days.${d._id}.dish`)">{{ d.dish }}</span>
            <span class="meta">
              <span v-if="d.allergens.length" class="letters">{{ [...d.allergens].sort().join(' ') }}</span>
              <span v-if="d.price" class="price">{{ formatMoney(d.price, lang) }}</span>
            </span>
          </li>
        </ol>
        <p v-if="lunch.data.note" class="note" :lang="langOf(lunch, 'note')">{{ lunch.data.note }}</p>
        <AllergenKey class="key" :codes="lunch.data.days.flatMap((d) => d.allergens)" />
      </template>
      <p v-else class="pending">{{ t('lunchPending') }}</p>
    </main>

    <footer class="foot">
      {{ siteName }}, {{ contact.data.street }}, {{ contact.data.postalCode }} {{ contact.data.city }}, <a :href="telHref(contact.data.phone)">{{ contact.data.phone }}</a>
    </footer>
  </div>
</template>

<style scoped>
.sheet { max-width: 46rem; margin: 0 auto; padding: 24px var(--gutter) 48px; }
.bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.head { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 2px solid var(--ink); }
.leaf { width: 40px; height: 40px; color: var(--linde); }
.house { font-family: var(--serif); font-weight: 700; font-size: 1.6rem; letter-spacing: -0.01em; }
h1 { margin-top: 28px; font-size: 3rem; }
.range { margin-top: 6px; font-family: var(--serif); font-size: 1.4rem; font-weight: 500; }
.hint { color: var(--ink-2); }
.days { list-style: none; margin: 20px 0 0; padding: 0; border-top: 1px solid var(--rule); }
.days li {
  display: grid;
  grid-template-columns: 7rem 1fr auto;
  gap: 4px 20px;
  align-items: baseline;
  padding: 14px 0;
  border-bottom: 1px solid var(--rule);
  break-inside: avoid;
}
.day { font-weight: 700; }
.dish { font-family: var(--serif); font-size: 1.4rem; font-weight: 500; line-height: 1.3; }
.meta { display: flex; gap: 16px; justify-content: flex-end; align-items: baseline; }
.letters { font-size: 0.95rem; font-weight: 700; letter-spacing: 0.08em; }
.note { margin-top: 14px; }
.pending { margin-top: 20px; font-size: 1.3rem; }
.sheet .key { margin-top: 24px; padding: 16px 0 0; background: none; border-top: 1px solid var(--rule); border-radius: 0; }
.key :deep(h2) { font-size: 1.1rem; }
.foot { margin-top: 32px; padding-top: 10px; border-top: 1px solid var(--rule); color: var(--ink-2); font-size: 0.95rem; }
.foot a { color: inherit; text-decoration: none; }

@media (max-width: 719px) {
  .days li { grid-template-columns: 1fr; }
  .meta { justify-content: flex-start; }
  h1 { font-size: 2.25rem; }
}

@media print {
  @page { size: A4; margin: 15mm; }
  .screen-only { display: none !important; }
  :global(html), :global(body) { background: #fff !important; color: #000 !important; font-size: 11pt; }
  .sheet { max-width: none; padding: 0; color: #000; }
  .sheet * { background: none !important; box-shadow: none !important; color: #000 !important; border-color: #000 !important; }
  .head { border-bottom-width: 1.5pt; }
  .leaf { width: 14mm; height: 14mm; }
  .house { font-size: 20pt; }
  h1 { font-size: 34pt; margin-top: 8mm; }
  .range { font-size: 16pt; }
  .days { margin-top: 6mm; border-top-color: #000 !important; }
  .days li { padding: 6.5mm 0; border-bottom: 0.5pt solid #000; }
  /* Read at the door from a step away: the dishes fill the sheet. */
  .dish { font-size: 19pt; }
  .day, .letters, .price { font-size: 13pt; }
  .sheet .key { margin-top: 8mm; padding: 0; font-size: 9pt; }
  .key :deep(h2) { font-size: 10pt; margin-bottom: 2mm; }
  .key :deep(dl) { grid-template-columns: repeat(3, 1fr); gap: 1mm 6mm; }
  .foot { margin-top: 8mm; font-size: 9pt; }
}
</style>
