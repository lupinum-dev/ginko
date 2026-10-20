<script setup lang="ts">
import { personJsonLd } from '@lupinum/ginko/basics'
import { ArrowRight } from '@lucide/vue'

// One author: initials, name, role, short bio, and their posts, newest first, with Person JSON-LD. The address comes
// from the `people` route in ginko.config.ts (/about/<slug>); an unknown author is a 404.
const route = useRoute()
const person = useGinkoEntry('people', () => route.params.slug)
const posts = useBlogPosts()
const path = useGinkoPath()
const { url, name } = useGinkoSite()
const { t } = useI18n()
const written = computed(() => posts.value.filter((post) => post.authors.some((author) => author.id === person.value.id)))
usePageSeo(() => ({
  title: person.value.data.name,
  description: person.value.data.bio ?? person.value.data.role,
  jsonLd: [personJsonLd({
    name: person.value.data.name,
    role: person.value.data.role,
    bio: person.value.data.bio,
    url: new URL(person.value.url, url).href,
    worksFor: { name, url },
  })],
}))
</script>

<template>
  <article>
    <header class="mx-auto max-w-page px-gutter pt-12 pb-8 md:pt-20 md:pb-12">
      <div class="flex max-w-3xl flex-col gap-5">
        <InitialsAvatar :name="person.data.name" size="lg" />
        <h1 class="text-h1">{{ person.data.name }}</h1>
        <p v-if="person.data.role" class="text-lead text-muted-foreground">{{ person.data.role }}</p>
        <p v-if="person.data.bio" class="max-w-prose">{{ person.data.bio }}</p>
      </div>
    </header>
    <section aria-labelledby="author-posts" class="mx-auto max-w-page px-gutter">
      <div class="max-w-4xl">
        <h2 id="author-posts" class="pb-2 text-h3">{{ t('author.posts', { name: person.data.name }) }}</h2>
        <BlogPostList v-if="written.length" :items="written" heading-level="h3" eager />
        <p v-else class="border-t py-8 text-muted-foreground">{{ t('author.none') }}</p>
        <NuxtLink :to="path('news')" class="mt-6 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
          {{ t('blog.all') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </NuxtLink>
      </div>
    </section>
  </article>
</template>
