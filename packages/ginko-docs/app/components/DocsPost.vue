<script setup lang="ts">
// One blog post: title, date, authors, text. Article JSON-LD names the authors and carries both dates.
import { articleLd } from '@lupinum/ginko'
import type { Post } from '../composables/useBlog'

const props = defineProps<{ post: Post }>()
const { t } = useI18n()
const blog = useBlog()
const locale = useGinkoLocale()
const site = useRuntimeConfig().public.ginko as { url: string }
const route = useRoute()
const authors = computed(() => blog.authorsOf(props.post))
const absolute = (path: string) => new URL(path, site.url).href

useGinkoSeo(() => {
  const { title, description, date, image } = props.post.data
  const ld = articleLd({
    title, description, lang: locale.value, url: absolute(route.path), image: image ? absolute(image.url) : undefined,
    published: date, modified: (props.post.updatedAt ?? date).slice(0, 10),
  })
  return {
    title, description, type: 'article', image: image?.url,
    // articleLd takes one author; a post may have several (and a link), so the list replaces it.
    jsonLd: [authors.value.length ? { ...ld, author: authors.value.map((a) => ({ '@type': 'Person', name: a.data.name, ...(a.data.url ? { url: a.data.url } : {}) })) } : ld],
  }
})
useHead(() => ({ link: [{ rel: 'alternate', type: 'application/rss+xml', title: t('docs.blog'), href: blog.feedPath.value }] }))
</script>

<template>
  <div class="docs-blog">
    <div class="docs-blog-panel">
      <article class="docs-post">
        <nav class="docs-crumbs" :aria-label="t('docs.breadcrumb')">
          <ol>
            <li><NuxtLink :to="blog.blogPath.value">{{ t('docs.blog') }}</NuxtLink></li>
            <li><Icon name="lucide:chevron-right" class="docs-icon" /><span aria-current="page">{{ post.data.title }}</span></li>
          </ol>
        </nav>
        <h1>{{ post.data.title }}</h1>
        <p v-if="post.data.description" class="docs-lead">{{ post.data.description }}</p>
        <p class="docs-meta">
          <time :datetime="post.data.date">{{ blog.formatDate(post.data.date) }}</time>
          <template v-if="authors.length">
            · {{ t('docs.by') }}
            <template v-for="(a, i) in authors" :key="a.id">
              <template v-if="i">, </template>
              <a v-if="a.data.url" :href="a.data.url" rel="author">{{ a.data.name }}</a>
              <template v-else>{{ a.data.name }}</template>
            </template>
          </template>
        </p>
        <GinkoImage v-if="post.data.image" :image="post.data.image" class="docs-post-image" eager />
        <GinkoMarkdown :value="post.data.body" :components="markdownComponents" class="docs-prose" />
      </article>
    </div>
  </div>
</template>
