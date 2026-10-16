<script setup lang="ts">
import { releaseAnchor as anchor } from '@lupinum/ginko/basics'
import { markdownComponents } from '../lib/markdownComponents'
// The changelog: one page, one section per release, newest first (the collection's order). Each version has an anchor.
const { t } = useI18n()
const blog = useDocsBlog()
const entries = blog.changelog()
useGinkoSeo(() => ({ title: t('docs.changelog') }))
</script>

<template>
  <div class="docs-blog">
    <div class="docs-blog-panel">
      <header class="docs-blog-head">
        <h1>{{ t('docs.changelog') }}</h1>
      </header>
      <section v-for="entry in entries.items" :id="anchor(entry.data.version)" :key="entry.id" class="docs-release">
        <div class="docs-release-meta">
          <h2><a :href="`#${anchor(entry.data.version)}`">{{ entry.data.version }}</a></h2>
          <p class="docs-meta"><time :datetime="entry.data.date">{{ blog.formatDate(entry.data.date) }}</time></p>
        </div>
        <GinkoMarkdown :value="entry.data.body" :components="markdownComponents" class="docs-prose" />
      </section>
    </div>
  </div>
</template>
