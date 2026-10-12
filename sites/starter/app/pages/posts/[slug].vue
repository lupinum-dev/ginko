<script setup lang="ts">
const { format } = useI18n()
const route = useRoute()
const path = usePagePath()
const post = useGinkoEntry('posts', String(route.params.slug))
useGinkoSeo(() => ({
  title: post.value.data.title,
  description: post.value.data.summary,
  image: post.value.data.cover ? { url: post.value.data.cover.url, width: post.value.data.cover.width, height: post.value.data.cover.height } : undefined,
  type: 'article',
}))
</script>

<template>
  <article class="column">
    <p><NuxtLink :to="path('posts')">All posts</NuxtLink></p>
    <h1>{{ post.data.title }}</h1>
    <p class="meta"><time :datetime="post.data.date">{{ format.date(post.data.date, 'long') }}</time></p>
    <img v-if="post.data.cover && safeHref(post.data.cover.url)" :src="safeHref(post.data.cover.url)" :alt="post.data.cover.alt" :width="post.data.cover.width" :height="post.data.cover.height">
    <GinkoMarkdown :value="post.data.body" class="prose" />
    <ul v-if="post.data.tags.length" class="tags" aria-label="Tags">
      <li v-for="tag in post.data.tags" :key="tag._id">{{ tag.name }}</li>
    </ul>
  </article>
</template>
