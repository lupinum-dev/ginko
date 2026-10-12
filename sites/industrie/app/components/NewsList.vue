<!-- News as a dated list: date, title, the first 160 characters, optionally a thumbnail. `limit` shortens it on the home page. -->
<script setup lang="ts">
import { excerpt } from '../utils/site'
const { t, format } = useI18n()

const props = defineProps<{ limit?: number; thumbs?: boolean }>()
const { lang } = useSite()
const news = useGinko('news')
const items = computed(() => (props.limit ? news.value.items.slice(0, props.limit) : news.value.items))
</script>

<template>
  <ol v-if="items.length" class="news">
    <li v-for="n in items" :key="n.id" class="item" data-test="news">
      <p class="date mono">{{ format.date(n.data.date) }}</p>
      <div class="text">
        <h3 :lang="langOf(n, 'title')"><NuxtLink :to="n.url">{{ n.data.title }}</NuxtLink></h3>
        <p class="excerpt" :lang="langOf(n, 'body')">{{ excerpt(n.data.body) }}</p>
      </div>
      <img v-if="thumbs && n.data.image && safeHref(n.data.image.url)" class="thumb" :src="safeHref(n.data.image.url)" :alt="n.data.image.alt" :lang="langOf(n, 'image.alt')" width="120" :height="Math.round(120 * n.data.image.height / n.data.image.width)" loading="lazy">
    </li>
  </ol>
  <p v-else class="empty">{{ t('noNews') }}</p>
</template>

<style scoped>
.news { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--rule); }
.item { position: relative; display: grid; gap: 4px 24px; padding: 16px 0; border-bottom: 1px solid var(--rule); grid-template-columns: 1fr auto; }
.date { grid-column: 1 / -1; font-size: 0.9rem; color: var(--ink-2); }
h3 { font-size: 1.15rem; }
h3 a { color: var(--ink); text-decoration: none; }
h3 a::after { content: ''; position: absolute; inset: 0; }
.item:hover h3 a { text-decoration: underline; }
.excerpt { margin-top: 4px; color: var(--ink-2); }
.thumb { width: 120px; border-radius: var(--radius); border: 1px solid var(--rule); align-self: start; }
@media (min-width: 720px) {
  .item { grid-template-columns: 11rem 1fr auto; }
  .date { grid-column: auto; padding-top: 4px; }
}
</style>
