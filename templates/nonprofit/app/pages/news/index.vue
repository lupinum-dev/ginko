<!-- Synced from templates/_features/blog/app/pages/news/index.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { Rss } from '@lucide/vue'

// The news: every post, newest first (content/posts/). `?tag=water` shows the posts with that tag. The feed of this
// language is linked in the head and below the list. The address per language comes from `pages.news` in
// ginko.config.ts.
const route = useRoute()
const posts = useBlogPosts()
const path = useGinkoPath()
const feed = useFeedPath()
const { t } = useI18n('blog')
const tag = computed(() => (typeof route.query.tag === 'string' && route.query.tag ? route.query.tag : undefined))
const shown = computed(() => (tag.value ? posts.value.filter((post) => post.tags.includes(tag.value!)) : posts.value))
useHead(() => ({ link: [{ rel: 'alternate', type: 'application/rss+xml', title: t('feed'), href: feed.value }] }))
usePageSeo(() => ({ title: t('title'), description: t('lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <div class="max-w-4xl">
        <p v-if="tag" class="flex flex-wrap items-center gap-x-4 pb-4 text-small">
          <span>{{ t('tagged', { tag }) }}</span>
          <NuxtLink :to="path('news')" class="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{{ t('all') }}</NuxtLink>
        </p>
        <BlogPostList v-if="shown.length" :items="shown" />
        <BlockEmpty v-else :title="tag ? t('noTag', { tag }) : t('empty')" :path="tag ? undefined : 'content/posts/'" />
        <a :href="feed" class="mt-6 inline-flex min-h-11 items-center gap-2 text-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          <Rss class="size-4" aria-hidden="true" />{{ t('feed') }}
        </a>
      </div>
    </div>
  </div>
</template>
