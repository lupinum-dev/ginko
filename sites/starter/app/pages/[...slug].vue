<script setup lang="ts">
const route = useRoute()
const slug = Array.isArray(route.params.slug) ? route.params.slug.join('/') : String(route.params.slug)
const page = useGinkoEntry('pages', slug)
useGinkoSeo(() => ({
  title: page.value.data.title,
  description: page.value.data.intro,
  image: page.value.data.image ? { url: page.value.data.image.url, width: page.value.data.image.width, height: page.value.data.image.height } : undefined,
}))
</script>

<template>
  <article class="column">
    <h1>{{ page.data.title }}</h1>
    <p v-if="page.data.intro" class="lede">{{ page.data.intro }}</p>
    <img v-if="page.data.image && safeHref(page.data.image.url)" :src="safeHref(page.data.image.url)" :alt="page.data.image.alt" :width="page.data.image.width" :height="page.data.image.height">
    <GinkoMarkdown :value="page.data.body" class="prose" />
  </article>
</template>
