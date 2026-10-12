<script setup lang="ts">
import { siteName } from '../../utils/site'

const props = defineProps<{ slug: string }>()
const { lang } = useSite()
const path = usePagePath()
const { t, format } = useI18n()
const post = useGinkoEntry('blog', props.slug)
useSeoMeta({
  title: () => `${post.value.data.title} | ${siteName}`,
  description: () => post.value.data.description,
  ogTitle: () => `${post.value.data.title} | ${siteName}`,
  ogDescription: () => post.value.data.description,
  ogImage: () => safeHref(post.value.data.image?.url),
})
</script>

<template>
  <article class="wrap page-body post">
    <NuxtLink :to="path('blog')" class="back">{{ t('allPosts') }}</NuxtLink>
    <h1 class="page-title" :lang="langOf(post, 'title')">{{ post.data.title }}</h1>
    <p class="facts mono">{{ post.data.author }} · <time :datetime="post.data.date">{{ format.date(post.data.date) }}</time></p>
    <img v-if="safeHref(post.data.image?.url)" class="image" :src="safeHref(post.data.image?.url)" :alt="post.data.image!.alt" :lang="langOf(post, 'image.alt')" :width="post.data.image!.width" :height="post.data.image!.height">
    <GinkoMarkdown :value="post.data.body" class="prose" :lang="langOf(post, 'body')" />
  </article>
</template>

<style scoped>
.back { display: inline-block; margin-top: 40px; font-weight: 500; padding-block: 8px; }
.page-title { margin-top: 8px; max-width: 22ch; }
.facts { margin: 18px 0 28px; color: var(--ink-2); font-size: 0.93rem; }
.image { width: 100%; max-height: 32rem; object-fit: cover; border: var(--line) solid var(--ink); border-radius: var(--radius); margin-bottom: 32px; }
</style>
