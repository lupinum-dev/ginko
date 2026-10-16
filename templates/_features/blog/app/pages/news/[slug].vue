<script setup lang="ts">
import { postJsonLd } from '@lupinum/ginko/basics'
import { ArrowRight } from '@lucide/vue'

// One post: title, summary, date, authors (initials and role), cover (3:2), text and tags, with BlogPosting JSON-LD,
// and a link on to all news, so a visitor who comes from a share or the feed does not end above the footer.
const route = useRoute()
const entry = useGinkoEntry('posts', () => route.params.slug)
const posts = useBlogPosts()
const tagPath = useTagPath()
const path = useGinkoPath()
const { url } = useGinkoSite()
const { t, format, language } = useI18n('blog')
// Read the entry first: it answers 404 for an unknown or hidden slug, also in a language whose list is empty (there
// `find` never calls its callback). Past that line the entry is visible, so the list has it.
const post = computed(() => {
  const id = entry.value.id
  return posts.value.find((item) => item.id === id)!
})
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
          <NuxtLink :to="tagPath(tag)" class="inline-flex min-h-11 items-center rounded-md border px-4 text-small transition-[color,background-color,border-color] duration-150 hover:bg-accent">{{ tag }}</NuxtLink>
        </li>
      </ul>
    </div>
    <div class="mx-auto max-w-page px-gutter pt-10">
      <NuxtLink :to="path('news')" class="inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
        {{ t('latest') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </div>
  </article>
</template>
