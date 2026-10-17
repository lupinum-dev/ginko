<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

// One tag: the posts that carry it, newest first. Tags are free text in each language's files, so a tag has no
// translation: in another language the switch leads to that language's news page. A tag no visible post carries is
// a 404. The address is the news page's, then the word for `tags` in app/routes.ts (`segments`), then the tag.
definePageMeta({
  i18nAlternates: (to, { locale }) => {
    const path = useGinkoPath()
    const { locales } = useGinkoSite()
    return Object.fromEntries(locales.map((code) => [code, code === locale ? to.path : path('news', code)]))
  },
})
const route = useRoute()
const posts = useBlogPosts()
const tags = useBlogTags()
const path = useGinkoPath()
const { t } = useI18n('blog')
const slug = computed(() => String(route.params.tag))
// Thrown on every read while no post carries the tag, like useGinkoEntry: fatal, so client navigation shows the 404.
const tag = toRef(() => {
  const found = tags.value.find((item) => item.slug === slug.value)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Not found', fatal: true })
  return found
})
const tagged = computed(() => posts.value.filter((post) => post.tags.some((name) => tagSlug(name) === tag.value.slug)))
usePageSeo(() => ({ title: tag.value.name, description: t('count', { count: tag.value.count }) }))
</script>

<template>
  <div>
    <BlockPageHeader :title="tag.name" :meta="t('count', { count: tag.count })" />
    <div class="mx-auto max-w-page px-gutter">
      <div class="max-w-4xl">
        <BlogPostList :items="tagged" />
        <NuxtLink :to="path('news')" class="mt-6 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
          {{ t('all') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
