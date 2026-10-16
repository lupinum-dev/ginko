<!-- Synced from templates/_features/blog/app/pages/news/index.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { Rss } from '@lucide/vue'
import type { BlogPost } from '~/composables/useBlog'

// The news: every post, newest first (content/posts/), grouped by year once they span more than one, with the tags
// as links to their pages above them. The feed of this language is linked in the head and below the list. The address
// per language comes from `pages.news` in ginko.config.ts.
const posts = useBlogPosts()
const tags = useBlogTags()
const feed = useFeedPath()
const route = useRoute()
const { name, url } = useGinkoSite()
const { t, language } = useI18n('blog')
const years = computed(() => {
  const groups: { year: string, posts: BlogPost[] }[] = []
  for (const post of posts.value) {
    const year = post.date.slice(0, 4)
    if (groups.at(-1)?.year === year) groups.at(-1)!.posts.push(post)
    else groups.push({ year, posts: [post] })
  }
  return groups
})
useHead(() => ({ link: [{ rel: 'alternate', type: 'application/rss+xml', title: t('feed'), href: feed.value }] }))
usePageSeo(() => ({
  title: t('title'),
  description: t('lead'),
  jsonLd: [{ '@context': 'https://schema.org', '@type': 'Blog', name: `${name}: ${t('title')}`, description: t('lead'), url: new URL(route.path, url).href, inLanguage: language.value }],
}))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <div class="max-w-4xl">
        <nav v-if="tags.length" :aria-label="t('tags')" class="pb-8">
          <ul class="flex flex-wrap gap-2">
            <li v-for="tag in tags" :key="tag.slug">
              <NuxtLink :to="tag.to" rel="tag" class="inline-flex min-h-11 items-center rounded-md border px-4 text-small transition-[color,background-color,border-color] duration-150 hover:bg-accent">{{ tag.name }}</NuxtLink>
            </li>
          </ul>
        </nav>
        <template v-if="years.length > 1">
          <section v-for="group in years" :key="group.year" :aria-labelledby="`year-${group.year}`" class="pt-6 first:pt-0">
            <h2 :id="`year-${group.year}`" class="pb-2 text-h3 tabular-nums">{{ group.year }}</h2>
            <BlogPostList :items="group.posts" heading-level="h3" />
          </section>
        </template>
        <BlogPostList v-else-if="posts.length" :items="posts" />
        <BlockEmpty v-else :title="t('empty')" path="content/posts/" />
        <a :href="feed" class="mt-6 inline-flex min-h-11 items-center gap-2 text-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          <Rss class="size-4" aria-hidden="true" />{{ t('feed') }}
        </a>
      </div>
    </div>
  </div>
</template>
