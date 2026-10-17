<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

// The home page answers "what is new?" in the first screen: one line on what the blog is (content/home.md), then the
// newest post with its photo, date, reading time and author. Below: the next posts, the topics and the two writers.
// The feed is in the footer of every page. A section whose list is empty is left out.
const home = useGinko('home')
const posts = useBlogPosts()
const tags = useBlogTags()
const people = useGinko('people')
const path = useGinkoPath()
const locale = useGinkoLocale()
const { t } = useI18n()
const newest = computed(() => posts.value[0])
const more = computed(() => posts.value.slice(1, 5))
usePageSeo(() => ({ home: true, description: home.value.data.lead }))
</script>

<template>
  <div>
    <BlockHero :title="home.data.title" :lead="home.data.lead" />

    <div class="mx-auto max-w-page px-gutter pt-12 md:pt-16">
      <HomeLatestPost v-if="newest" :post="newest" />
      <BlockEmpty v-else :title="t('blog.empty')" path="content/posts/" />
    </div>

    <BlockSection v-if="more.length" :title="t('home.more')">
      <BlogPostList :items="more" heading-level="h3" />
      <NuxtLink :to="path('news')" class="mt-6 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline">
        {{ t('blog.all') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </BlockSection>

    <BlockSection v-if="tags.length" :title="t('blog.tags')">
      <ul class="flex flex-wrap gap-2">
        <li v-for="tag in tags" :key="tag.slug">
          <NuxtLink :to="tag.to" rel="tag" class="inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-small transition-[color,background-color,border-color] duration-150 hover:bg-accent">
            <span class="sr-only">{{ t('blog.topicCount', { name: tag.name, count: tag.count }) }}</span>
            <span aria-hidden="true">{{ tag.name }}</span><span class="text-muted-foreground tabular-nums" aria-hidden="true">{{ tag.count }}</span>
          </NuxtLink>
        </li>
      </ul>
    </BlockSection>

    <BlockSection v-if="people.items.length" :title="t('home.authors')">
      <ul class="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        <li v-for="person in people.items" :key="person.id" class="flex items-start gap-4">
          <InitialsAvatar :name="person.data.name" />
          <div class="flex flex-col gap-1">
            <h3 class="font-medium">
              <NuxtLink v-if="person.urls?.[locale]" :to="person.urls[locale]" class="underline-offset-4 hover:underline">{{ person.data.name }}</NuxtLink>
              <template v-else>{{ person.data.name }}</template>
            </h3>
            <p v-if="person.data.role" class="text-small text-muted-foreground">{{ person.data.role }}</p>
          </div>
        </li>
      </ul>
    </BlockSection>
  </div>
</template>
