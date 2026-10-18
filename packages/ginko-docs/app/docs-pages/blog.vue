<script setup lang="ts">
// The blog: all posts, newest first (the collection's order).
const { t, language } = useI18n()
const blog = useDocsBlog()
const langOf = useGinkoLang()
const posts = blog.posts()
// A list page: CollectionPage JSON-LD, so search engines read it as the index of its entries.
const site = useGinkoSite()
const route = useRoute()
useGinkoSeo(() => ({
  title: t('docs.blog'),
  description: t('docs.blogLead'),
  jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: t('docs.blog'), url: new URL(route.path, site.url).href, inLanguage: language.value }],
}))
useHead(() => ({ link: [{ rel: 'alternate', type: 'application/rss+xml', title: t('docs.blog'), href: blog.feedPath.value }] }))
// Nitro's crawler only follows links to pages (no `.xml`), but it also reads this header, so `nuxt generate` writes the feed.
if (import.meta.server) useResponseHeader('x-nitro-prerender').value = blog.feedPath.value
</script>

<template>
  <div class="docs-blog">
    <div class="docs-blog-panel">
      <header class="docs-blog-head">
        <div>
          <h1>{{ t('docs.blog') }}</h1>
          <p class="docs-lead">{{ t('docs.blogLead') }}</p>
        </div>
        <a :href="blog.feedPath.value" type="application/rss+xml"><DocsIcon name="lucide:rss" class="docs-icon" />{{ t('docs.rss') }}</a>
      </header>
      <ul class="docs-posts">
        <li v-for="post in posts.items" :key="post.id">
          <div class="docs-post-side">
            <p class="docs-meta"><time :datetime="post.data.date">{{ blog.formatDate(post.data.date) }}</time></p>
            <p v-if="blog.authorsOf(post).length" class="docs-authors">
              <template v-for="a in blog.authorsOf(post)" :key="a.id">
                <GinkoImage v-if="a.data.avatar" :image="a.data.avatar" class="docs-avatar" />
              </template>
              {{ blog.authorsOf(post).map((a) => a.data.name).join(', ') }}
            </p>
          </div>
          <div class="docs-post-main">
            <h2>
              <NuxtLink :to="post.url">{{ post.data.title }}</NuxtLink>
              <span v-if="blog.isDraft(post)" class="docs-tag docs-tag-draft">{{ t('docs.draft') }}</span>
            </h2>
            <p v-if="post.data.description" class="docs-post-teaser" :lang="langOf(post, 'description')">{{ post.data.description }}</p>
            <p v-if="post.data.tags?.length" class="docs-tags">
              <span v-for="tag in post.data.tags" :key="tag.tag" class="docs-tag">{{ tag.tag }}</span>
            </p>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
