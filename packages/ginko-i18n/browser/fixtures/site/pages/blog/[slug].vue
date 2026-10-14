<script setup lang="ts">
definePageMeta({
  // Runs before render (server and client navigation), so switcher, head and payload agree.
  i18nAlternates: async (to, { locale, localePath }) => {
    const post = await $fetch<{ slugs: Record<string, string> }>('/api/post', { query: { slug: to.params.slug, locale } }).catch(() => null)
    if (!post) return undefined
    return Object.fromEntries(Object.entries(post.slugs).map(([c, slug]) => [c, localePath(`/blog/${slug}`, c)]))
  },
})
const route = useRoute()
const { t, locale } = useI18n()
const { data: post } = await useFetch('/api/post', { query: { slug: 'slug' in route.params ? route.params.slug : '', locale } })
if (!post.value) throw createError({ statusCode: 404, statusMessage: t('blog.notFound'), fatal: true })
</script>

<template>
  <article>
    <h1 data-test="title">
      {{ post?.title }}
    </h1>
  </article>
</template>
