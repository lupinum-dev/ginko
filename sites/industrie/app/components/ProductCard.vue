<!-- A product as a card: name, short text, the first three specs, the datasheet. The name link covers the card. -->
<script setup lang="ts">
import { formatSize } from '../utils/site'

type Product = GinkoItem<'products'>
defineProps<{ product: Product }>()
const { lang } = useSite()
const { t } = useI18n()
</script>

<template>
  <article class="card">
    <h3 :lang="ginkoLangOf(product, 'name')"><NuxtLink :to="product.url">{{ product.data.name }}</NuxtLink></h3>
    <p class="summary" :lang="ginkoLangOf(product, 'summary')">{{ product.data.summary }}</p>
    <dl v-if="product.data.specs.length" class="specs mono">
      <div v-for="s in product.data.specs.slice(0, 3)" :key="s._id">
        <dt :lang="ginkoLangOf(product, `specs.${s._id}.name`)">{{ s.name }}</dt>
        <!-- Value and unit each carry the language they come in (an untranslated one stays German). -->
        <dd><span :lang="ginkoLangOf(product, `specs.${s._id}.value`)">{{ s.value }}</span><template v-if="s.unit">&nbsp;<span :lang="ginkoLangOf(product, `specs.${s._id}.unit`)">{{ s.unit }}</span></template></dd>
      </div>
    </dl>
    <a v-if="product.data.datasheet && safeHref(product.data.datasheet.url)" class="sheet" :href="safeHref(product.data.datasheet.url)" rel="noopener">{{ t('datasheet', { size: formatSize(product.data.datasheet.size, lang) }) }}</a>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
}
.card:hover { border-color: var(--steel); }
h3 { font-size: 1.2rem; }
h3 a { color: var(--ink); text-decoration: none; }
h3 a::after { content: ''; position: absolute; inset: 0; }
.summary {
  color: var(--ink-2);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.specs { margin: 0; font-size: 0.9rem; }
.specs div { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; border-top: 1px solid var(--rule); }
.specs dt { color: var(--ink-2); font-family: var(--sans); }
.specs dd { margin: 0; text-align: right; }
.sheet { position: relative; margin-top: auto; padding-top: 4px; font-size: 0.95rem; }
</style>
