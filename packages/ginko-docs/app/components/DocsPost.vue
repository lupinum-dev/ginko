<script setup lang="ts">
import { markdownComponents } from '../lib/markdownComponents'
// One blog post: title, date, authors, text. BlogPosting JSON-LD names the authors and carries both dates.
import { postJsonLd } from '@lupinum/ginko/basics'
import type { Post } from '../lib/blogTypes'

const props = defineProps<{ post: Post }>()
const { t, language } = useI18n()
const blog = useDocsBlog()
const langOf = useGinkoLang()
const site = useGinkoSite()
const route = useRoute()
const authors = computed(() => blog.authorsOf(props.post))
const absolute = (path: string) => new URL(path, site.url).href

useGinkoSeo(() => {
  const { title, description, date, image, tags } = props.post.data
  return {
    title, description, type: 'article', image: image?.url,
    jsonLd: [postJsonLd({
      title, description, lang: language.value, url: absolute(route.path), image: image ? absolute(image.url) : undefined,
      date, modified: (props.post.updatedAt ?? date).slice(0, 10),
      authors: authors.value.map((a) => a.data), tags: tags?.map((item) => item.tag),
    })],
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
            <li><DocsIcon name="lucide:chevron-right" class="docs-icon" /><span aria-current="page">{{ post.data.title }}</span></li>
          </ol>
        </nav>
        <h1>{{ post.data.title }}</h1>
        <p v-if="post.data.description" class="docs-lead" :lang="langOf(post, 'description')">{{ post.data.description }}</p>
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
