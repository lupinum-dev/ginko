<script setup lang="ts">
import { formatSize } from '../../utils/site'
import { safeHref } from '@lupinum/ginko'

const langOf = useGinkoLang()
const { t } = useI18n()

const props = defineProps<{ slug: string }>()
const { lang, head } = useSite()
const path = useGinkoPath()
const product = useGinkoEntry('products', () => props.slug)
head(() => product.value.data.name, 'products', () => safeHref(product.value.data.images[0]?.image.url))
const data = computed(() => product.value.data)
const sheet = computed(() => (data.value.datasheet && safeHref(data.value.datasheet.url) ? data.value.datasheet : undefined))
</script>

<template>
  <article class="wrap product">
    <NuxtLink :to="path('products')" class="back">← {{ t('products') }}</NuxtLink>
    <h1 class="page-title" :lang="langOf(product, 'name')">{{ data.name }}</h1>
    <p class="lede summary" :lang="langOf(product, 'summary')">{{ data.summary }}</p>

    <ul v-if="data.images.some((i) => safeHref(i.image?.url))" class="images" :aria-label="t('productImages')">
      <li v-for="i in data.images" :key="i._id">
        <img v-if="safeHref(i.image?.url)" :src="safeHref(i.image.url)" :alt="i.image.alt" :lang="langOf(product, `images.${i._id}.image.alt`)" :width="i.image.width" :height="i.image.height">
      </li>
    </ul>

    <section class="block" aria-labelledby="specs-title">
      <h2 id="specs-title">{{ t('specs') }}</h2>
      <table v-if="data.specs.length" class="rules specs">
        <thead>
          <tr><th scope="col">{{ t('spec') }}</th><th scope="col" class="num">{{ t('value') }}</th><th scope="col" class="unit">{{ t('unit') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in data.specs" :key="s._id">
            <th scope="row" :lang="langOf(product, `specs.${s._id}.name`)">{{ s.name }}</th>
            <td class="num" :lang="langOf(product, `specs.${s._id}.value`)">{{ s.value }}</td>
            <td class="unit mono" :lang="langOf(product, `specs.${s._id}.unit`)">{{ s.unit }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">{{ t('noSpecs') }}</p>
    </section>

    <div v-if="sheet" class="download">
      <a class="button" :href="safeHref(sheet.url)" :download="sheet.name" rel="noopener">{{ t('datasheetDownload') }}</a>
      <span class="file mono">{{ sheet.name }} · {{ formatSize(sheet.size, lang) }}</span>
    </div>
  </article>
</template>

<style scoped>
.back { display: inline-block; margin-top: 32px; font-weight: 500; }
.page-title { margin-top: 12px; max-width: 24ch; }
.summary { margin-top: 12px; font-size: 1.1rem; }
.images { list-style: none; margin: 32px 0 0; padding: 0; display: flex; gap: 16px; overflow-x: auto; }
.images li { flex: none; }
.images img { height: auto; max-height: 240px; width: auto; max-width: 100%; border: 1px solid var(--rule); border-radius: var(--radius); background: var(--surface); }
.block { margin-top: 40px; max-width: 52rem; }
.block h2 { font-size: 1.3rem; margin-bottom: 16px; }
.specs { table-layout: fixed; }
.specs th[scope='col']:first-child, .specs th[scope='row'] { width: 42%; }
.specs .unit { width: 4.5rem; padding-left: 12px; }
.specs td.num { overflow-wrap: anywhere; }
@media (min-width: 720px) { .specs .unit { width: 7rem; padding-left: 16px; } }
.specs th[scope='row'] { font-weight: 400; }
.specs td.num { padding-right: 0; }
.download { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-top: 32px; }
.file { font-size: 0.85rem; color: var(--ink-2); }
</style>
