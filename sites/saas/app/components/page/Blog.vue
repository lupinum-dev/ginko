<script setup lang="ts">

const { lang, labels } = useSite()
const { t, format } = useI18n()
usePageSeo('blog')
const blog = useGinko('blog')
</script>

<template>
  <div class="wrap page-body">
    <h1 class="page-title">{{ labels.pages.blog.title }}</h1>
    <p v-if="!blog.items.length" class="empty">{{ t('noPosts') }}</p>
    <ul v-else class="posts">
      <li v-for="post in blog.items" :key="post.id" class="post">
        <NuxtLink v-if="ginkoSafeHref(post.data.image?.url)" :to="post.url" class="image-link" tabindex="-1" aria-hidden="true">
          <img :src="ginkoSafeHref(post.data.image?.url)" alt="" :width="post.data.image!.width" :height="post.data.image!.height" loading="lazy">
        </NuxtLink>
        <div class="text">
          <p class="meta mono"><time :datetime="post.data.date">{{ format.date(post.data.date) }}</time></p>
          <h2><NuxtLink :to="post.url" :lang="ginkoLangOf(post, 'title')">{{ post.data.title }}</NuxtLink></h2>
          <p class="description" :lang="ginkoLangOf(post, 'description')">{{ post.data.description }}</p>
          <p class="author">{{ t('by') }} {{ post.data.author }}</p>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.posts { list-style: none; margin: 40px 0 0; padding: 0; display: grid; gap: 20px; }
.post { display: flex; flex-direction: column; background: var(--surface); border: var(--line) solid var(--ink); border-radius: var(--radius); overflow: hidden; }
.image-link { display: block; border-bottom: var(--line) solid var(--ink); }
.image-link img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
.text { display: grid; gap: 8px; align-content: start; padding: 20px 22px 24px; flex: 1; }
.meta { color: var(--ink-2); font-size: 0.85rem; }
h2 { font-size: 1.35rem; line-height: 1.2; font-weight: 800; }
h2 a { color: var(--ink); text-decoration: none; }
h2 a:hover { text-decoration: underline; text-decoration-thickness: 2px; }
.description { color: var(--ink-2); }
.author { font-size: 0.93rem; font-weight: 500; margin-top: 4px; }
@media (min-width: 720px) {
  .posts { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 960px) {
  .posts { grid-template-columns: repeat(3, 1fr); }
}
</style>
