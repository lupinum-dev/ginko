<script setup lang="ts">
import { formatSize } from '../../utils/site'
const { t, format } = useI18n()

const props = defineProps<{ slug: string }>()
const { lang, head } = useSite()
const path = useGinkoPath()
const entry = useGinkoEntry('news', props.slug)
head(() => entry.value.data.title, 'news', () => ginkoSafeHref(entry.value.data.image?.url))
const data = computed(() => entry.value.data)
</script>

<template>
  <article class="wrap entry">
    <NuxtLink :to="path('news')" class="back">← {{ t('allNews') }}</NuxtLink>
    <p class="date mono">{{ format.date(data.date) }}</p>
    <h1 class="page-title" :lang="ginkoLangOf(entry, 'title')">{{ data.title }}</h1>
    <img v-if="data.image && ginkoSafeHref(data.image.url)" class="image" :src="ginkoSafeHref(data.image.url)" :alt="data.image.alt" :lang="ginkoLangOf(entry, 'image.alt')" :width="data.image.width" :height="data.image.height">
    <GinkoMarkdown :value="data.body" class="prose body" :lang="ginkoLangOf(entry, 'body')" />
    <a v-if="data.pressPdf && ginkoSafeHref(data.pressPdf.url)" class="button" :href="ginkoSafeHref(data.pressPdf.url)" :download="data.pressPdf.name" rel="noopener">{{ t('pressPdf', { size: formatSize(data.pressPdf.size, lang) }) }}</a>
  </article>
</template>

<style scoped>
.back { display: inline-block; margin-top: 32px; font-weight: 500; }
.date { margin-top: 20px; font-size: 0.9rem; color: var(--ink-2); }
.page-title { margin-top: 6px; max-width: 26ch; }
.image { margin-top: 28px; width: 100%; max-height: 32rem; object-fit: cover; border: 1px solid var(--rule); border-radius: var(--radius); }
.body { margin-block: 28px; }
</style>
