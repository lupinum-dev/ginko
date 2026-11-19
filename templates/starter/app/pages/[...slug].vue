<!-- Synced from templates/_features/pages/app/pages/[...slug].vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { Component } from 'vue'
import { safeHref } from '@lupinum/ginko'

// A page of content/pages/ at /<slug> (in other languages /<code>/<slug>). An unknown address is a real 404.
// A template can show more at the top of its pages with app/components/pages/Top.vue (prop `id`: the entry id, such
// as `pages/get-involved`); without that file, nothing is added. A template may bring app/components/pages/Header.vue
// (prop `id`): it replaces the page header and the photo; the page's action button then follows it.
const route = useRoute()
const page = useGinkoEntry('pages', () => route.params.slug)
const PagesHeader = Object.values(import.meta.glob<Component>('../components/pages/Header.vue', { eager: true, import: 'default' }))[0]
const PagesTop = Object.values(import.meta.glob<Component>('../components/pages/Top.vue', { eager: true, import: 'default' }))[0]
const action = computed(() => {
  const href = safeHref(page.value.data.actionUrl)
  return href && page.value.data.actionLabel ? { label: page.value.data.actionLabel, href } : undefined
})
usePageSeo(() => ({
  title: page.value.data.title,
  description: page.value.data.summary,
  image: page.value.data.image,
}))
</script>

<template>
  <article>
    <template v-if="PagesHeader">
      <component :is="PagesHeader" :id="page.id" />
      <div v-if="action" class="mx-auto flex max-w-page flex-col px-gutter pb-10">
        <Button as-child size="lg" class="self-start max-sm:self-stretch">
          <a :href="action.href">{{ action.label }}</a>
        </Button>
      </div>
      <component :is="PagesTop" v-if="PagesTop" :id="page.id" />
    </template>
    <template v-else>
      <BlockPageHeader :title="page.data.title" :lead="page.data.summary">
        <Button v-if="action" as-child size="lg" class="self-start max-sm:self-stretch">
          <a :href="action.href">{{ action.label }}</a>
        </Button>
      </BlockPageHeader>
      <component :is="PagesTop" v-if="PagesTop" :id="page.id" />
      <div v-if="page.data.image" class="mx-auto max-w-page px-gutter pb-10">
        <GinkoImage :image="page.data.image" eager sizes="(min-width: 1216px) 1152px, 100vw" class="aspect-video w-full rounded-block bg-muted object-cover" />
      </div>
    </template>
    <ProseBody :value="page.data.body" />
  </article>
</template>
