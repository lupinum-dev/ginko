<script setup lang="ts">
import { formatMoney, type Money } from '@lupinum/ginko'
import { priceOn, upcomingPrice } from '@lupinum/ginko-preset-gastro'

const langOf = useGinkoLang()

const { labels, lang, today } = useSite()
const { t, format, language } = useI18n()
const menu = useGinko('menu')
/** "ab 1. November 19,50 €" when the price changes within 14 days. */
function nextPriceLine(data: { price: Money; nextPrice?: Money; priceFrom?: string }) {
  const next = upcomingPrice(data, today.value, 14)
  return next && t('priceFrom', { date: format.date(next.from, { day: 'numeric', month: 'long' }), price: formatMoney(next.price, language.value) })
}
const order = ['starters', 'soups', 'mains', 'desserts', 'drinks']
const groups = computed(() => order
  .map((key) => ({ key, title: labels.value.categories[key]!, items: menu.value.items.filter((i) => i.data.category === key) }))
  .filter((g) => g.items.length))
const used = computed(() => [...new Set(menu.value.items.flatMap((i) => i.data.allergens))].sort())
useSeoMeta({ title: () => `${t('menu')} | Gasthaus zur Linde` })
</script>

<template>
  <div class="wrap card">
    <h1 class="page-title">{{ t('menu') }}</h1>
    <p class="lede intro">{{ t('menuIntro') }}</p>
    <section v-for="g in groups" :key="g.key" class="group" :aria-labelledby="`cat-${g.key}`">
      <h2 :id="`cat-${g.key}`">{{ g.title }}</h2>
      <ul class="dishes">
        <li v-for="item in g.items" :key="item.id" class="dish">
          <div class="line">
            <h3 :lang="langOf(item, 'name')">{{ item.data.name }}</h3>
            <span class="price">{{ formatMoney(priceOn(item.data, today), language) }}</span>
          </div>
          <p v-if="nextPriceLine(item.data)" class="next-price" data-test="next-price">{{ nextPriceLine(item.data) }}</p>
          <p v-if="item.data.description" class="desc" :lang="langOf(item, 'description')">{{ item.data.description }}</p>
          <p class="meta">
            <span v-if="item.data.veg !== 'none'" class="veg">{{ labels.veg[item.data.veg] }}</span>
            <Allergens :codes="item.data.allergens" />
          </p>
        </li>
      </ul>
    </section>
    <AllergenKey :codes="used" />
  </div>
</template>

<style scoped>
.intro { margin-top: 12px; }
.group { margin-top: 48px; }
.group h2 { font-size: clamp(1.6rem, 1.3rem + 1.2vw, 2.25rem); padding-bottom: 10px; border-bottom: 2px solid var(--ink); }
.dishes { list-style: none; margin: 0; padding: 0; }
.dish { padding: 16px 0; border-bottom: 1px solid var(--rule); display: grid; gap: 4px; }
.line { display: flex; justify-content: space-between; align-items: baseline; gap: 20px; }
h3 { font-size: 1.3rem; font-weight: 500; }
.line .price { font-size: 1.15rem; }
.next-price { font-size: 0.95rem; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.desc { color: var(--ink-2); max-width: 60ch; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 4px; }
.veg { font-size: 0.9rem; font-weight: 700; color: var(--linde-ink); }
.card > * { max-width: 46rem; }
</style>
