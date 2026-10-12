<script setup lang="ts">
import { planPrice, priceText, type Currency, type Period } from '../../utils/site'

const { lang, labels } = useSite()
const { t } = useI18n()
usePageSeo('pricing')
const pricing = useGinko('pricing')
const hero = useGinko('hero')

// Client-side state only: no cookie, no query string. The server renders the default (monthly, EUR).
const period = ref<Period>('month')
const currency = ref<Currency>('EUR')
const periods = computed(() => [{ value: 'month' as const, label: t('monthly') }, { value: 'year' as const, label: t('yearly') }])
const currencies = [{ value: 'EUR' as const, label: 'EUR' }, { value: 'CHF' as const, label: 'CHF' }]
</script>

<template>
  <div class="wrap page-body">
    <h1 class="page-title">{{ labels.pages.pricing.title }}</h1>
    <div class="toggles">
      <Segmented v-model="period" name="period" :legend="t('billing')" :options="periods" />
      <Segmented v-model="currency" name="currency" :legend="t('currency')" :options="currencies" />
    </div>

    <p v-if="!pricing.items.length" class="empty">{{ t('noPlans') }}</p>
    <template v-else>
      <ul class="plans">
        <li v-for="plan in pricing.items" :key="plan.id" class="plan" :class="{ featured: plan.data.featured }">
          <span v-if="plan.data.featured" class="badge">{{ t('popular') }}</span>
          <h2>{{ plan.data.name }}</h2>
          <p class="price" aria-live="polite">
            <template v-if="planPrice(plan.data, period, currency)">
              <span class="amount mono">{{ priceText(planPrice(plan.data, period, currency)!, lang) }}</span>
              <span class="period">{{ period === 'month' ? t('perMonth') : t('perYear') }}</span>
            </template>
            <span v-else class="amount only mono">{{ t('onlyMonthly') }}</span>
          </p>
          <ul class="features">
            <li v-for="feature in plan.data.features" :key="feature._id" :lang="ginkoLangOf(plan, `features.${feature._id}.text`)">
              <svg class="check" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true"><path d="M3 9.5 7 13.5 15 4.5" /></svg>
              {{ feature.text }}
            </li>
          </ul>
          <p v-if="plan.data.note" class="note" :lang="ginkoLangOf(plan, 'note')">{{ plan.data.note }}</p>
        </li>
      </ul>
      <p class="vat">{{ labels.vat[currency] }}</p>
      <!-- The trial button of the hero: on phones the header has none, so the pricing page offers it here. -->
      <a v-if="safeHref(hero.data.buttonUrl)" class="button trial" :href="safeHref(hero.data.buttonUrl)" rel="noopener" :lang="ginkoLangOf(hero, 'buttonText')">{{ hero.data.buttonText }}</a>
    </template>
  </div>
</template>

<style scoped>
.toggles { display: flex; flex-wrap: wrap; gap: 12px 20px; margin-top: 28px; }
.plans { list-style: none; margin: 40px 0 0; padding: 0; display: grid; gap: 16px; align-items: stretch; }
.plan { position: relative; display: flex; flex-direction: column; gap: 16px; background: var(--surface); border: var(--line) solid var(--ink); border-radius: var(--radius); padding: 28px 24px 24px; }
/* The featured plan: a 2px ink border and a yellow tab on top. The extra 0.5px comes off the padding, so the content does not move. */
.plan.featured { border-width: 2px; padding: 27.5px 23.5px 23.5px; }
.badge { position: absolute; top: -1px; right: 20px; transform: translateY(-50%); padding: 3px 12px; background: var(--yellow); color: var(--yellow-ink); border: 2px solid var(--ink); border-radius: var(--radius); font-family: var(--head); font-weight: 700; font-size: 0.85rem; line-height: 1.4; }
h2 { font-size: 1.6rem; font-weight: 800; }
.price { display: grid; gap: 0; min-height: 4.4rem; align-content: start; }
.amount { font-size: clamp(1.9rem, 1.4rem + 1.4vw, 2.5rem); font-weight: 700; line-height: 1.2; white-space: nowrap; }
.amount.only { font-size: 1.15rem; font-weight: 500; color: var(--ink-2); padding-top: 0.55rem; white-space: normal; }
.period { color: var(--ink-2); font-size: 0.93rem; }
.features { list-style: none; margin: 0; padding: 16px 0 0; border-top: var(--line) solid var(--rule); display: grid; gap: 10px; flex: 1; align-content: start; }
.features li { display: grid; grid-template-columns: 18px 1fr; gap: 10px; align-items: start; }
.check { margin-top: 5px; color: var(--green); }
.note { color: var(--ink-2); font-size: 0.9rem; }
.vat { margin-top: 24px; color: var(--ink-2); font-size: 0.93rem; }
.trial { margin-top: 20px; }
@media (min-width: 720px) {
  .plans { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
}
</style>
