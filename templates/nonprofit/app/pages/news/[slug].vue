<!-- Synced from templates/_features/blog/app/pages/news/[slug].vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { postJsonLd } from '@lupinum/ginko/basics'

// One post: title, summary, date, authors (initials and role), cover (3:2), text and tags, with BlogPosting JSON-LD.
const route = useRoute()
const entry = useGinkoEntry('posts', () => route.params.slug)
const posts = useBlogPosts()
const tagPath = useTagPath()
const { url } = useGinkoSite()
const { t, format, language } = useI18n('blog')
// The entry is visible (useGinkoEntry answers 404 otherwise), so the list has it.
const post = computed(() => posts.value.find((item) => item.id === entry.value.id)!)
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
    authors: post.value.authors.map((author) => ({ name: author.name })),
    tags: post.value.tags,
    lang: language.value,
  })],
}))
</script>

<template>
  <article>
    <BlockPageHeader :title="post.title" :lead="post.description">
      <p class="text-small text-muted-foreground tabular-nums"><time :datetime="post.date">{{ format.date(post.date) }}</time></p>
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
          <NuxtLink :to="tagPath(tag)" class="inline-flex min-h-11 items-center rounded-md border px-4 text-small transition-colors duration-150 hover:bg-accent">{{ tag }}</NuxtLink>
        </li>
      </ul>
    </div>
  </article>
</template>
