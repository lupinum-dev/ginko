<script setup lang="ts">
import type { Component } from 'vue'
import { postJsonLd } from '@lupinum/ginko/basics'
import { ArrowLeft, ArrowRight } from '@lucide/vue'

// One post: title, summary, date and reading time, authors (initials and role, linked to their page when people have
// one), cover (3:2), text and tags (linked to their pages), with BlogPosting JSON-LD; then the older and the newer
// post and a link to all news, so a visitor who comes from a share or the feed does not end above the footer. A template
// may bring `app/components/site/PageCta.vue`, its closing band: it shows at the end of the post.
const cta = Object.values(import.meta.glob<Component>('../../components/site/PageCta.vue', { eager: true, import: 'default' }))[0]
const route = useRoute()
const entry = useGinkoEntry('posts', () => route.params.slug)
const posts = useBlogPosts()
const tagPath = useTagPath()
const path = useGinkoPath()
const { url } = useGinkoSite()
const { t, format, language } = useI18n('blog')
// Read the entry first: it answers 404 for an unknown or hidden slug, also in a language whose list is empty (there
// `find` never calls its callback). Past that line the entry is visible, so the list has it.
const index = computed(() => {
  const id = entry.value.id
  return posts.value.findIndex((item) => item.id === id)
})
const post = computed(() => posts.value[index.value]!)
// The list is newest first: the newer post comes before this one, the older one after it.
const newer = computed(() => posts.value[index.value - 1])
const older = computed(() => posts.value[index.value + 1])
const absolute = (path: string) => new URL(path, url).href
usePageSeo(() => ({
  title: post.value.title,
  description: post.value.description,
  image: post.value.image,
  jsonLd: [postJsonLd({
    title: post.value.title,
    url: absolute(route.path),
    date: post.value.date,
    modified: entry.value.updatedAt,
    description: post.value.description,
    image: post.value.image ? absolute(post.value.image.url) : undefined,
    authors: post.value.authors.map((author) => ({ name: author.name, url: author.to ? absolute(author.to) : undefined })),
    tags: post.value.tags,
    lang: language.value,
  })],
}))
</script>

<template>
  <div>
    <article>
      <BlockPageHeader :title="post.title" :lead="post.description">
        <p class="text-small text-muted-foreground tabular-nums">
          <time :datetime="post.date">{{ format.date(post.date) }}</time>
          <template v-if="post.minutes"><span aria-hidden="true"> · </span><span class="sr-only">, </span>{{ t('minutes', { count: post.minutes }) }}</template>
        </p>
        <BlogByline :authors="post.authors" />
      </BlockPageHeader>
      <div v-if="post.image" class="mx-auto max-w-page px-gutter pb-10">
        <GinkoImage :image="post.image" eager sizes="(min-width: 1216px) 896px, 100vw" class="aspect-3/2 w-full max-w-4xl rounded-block bg-muted object-cover" />
      </div>
      <ProseBody :value="entry.data.body" />
      <div v-if="post.tags.length" class="mx-auto max-w-page px-gutter pt-10">
        <h2 class="sr-only">{{ t('tags') }}</h2>
        <ul class="flex flex-wrap gap-2">
          <li v-for="tag in post.tags" :key="tag">
            <NuxtLink :to="tagPath(tag)" rel="tag" class="inline-flex min-h-11 items-center rounded-md border px-4 text-small transition-[color,background-color,border-color] duration-150 hover:bg-accent">{{ tag }}</NuxtLink>
          </li>
        </ul>
      </div>
      <nav v-if="older || newer" :aria-label="t('pager')" class="mx-auto max-w-page px-gutter pt-10">
        <ul class="grid max-w-4xl gap-3 sm:grid-cols-2">
          <li v-if="older">
            <NuxtLink :to="older.to" rel="prev" class="flex h-full min-h-11 flex-col gap-1 rounded-block border p-5 transition-colors duration-150 hover:bg-accent">
              <span class="inline-flex items-center gap-2 text-small text-muted-foreground"><ArrowLeft class="size-4 rtl:-scale-x-100" aria-hidden="true" />{{ t('older') }}</span>
              <span class="font-medium">{{ older.title }}</span>
            </NuxtLink>
          </li>
          <li v-if="newer" class="sm:col-start-2">
            <NuxtLink :to="newer.to" rel="next" class="flex h-full min-h-11 flex-col items-end gap-1 rounded-block border p-5 text-end transition-colors duration-150 hover:bg-accent">
              <span class="inline-flex items-center gap-2 text-small text-muted-foreground">{{ t('newer') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" /></span>
              <span class="font-medium">{{ newer.title }}</span>
            </NuxtLink>
          </li>
        </ul>
      </nav>
      <div class="mx-auto max-w-page px-gutter pt-10">
        <NuxtLink :to="path('news')" class="inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
          {{ t('latest') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </article>
    <component :is="cta" v-if="cta" />
  </div>
</template>
