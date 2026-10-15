<script setup lang="ts">
import type { Component } from 'vue'
import { safeHref } from '@lupinum/ginko'

// A page of content/pages/ at /<slug> (in other languages /<code>/<slug>). An unknown address is a real 404.
// A template can show more at the top of its pages with app/components/pages/Top.vue (prop `id`: the entry id, such
// as `pages/get-involved`); without that file, nothing is added.
const route = useRoute()
const page = useGinkoEntry('pages', () => route.params.slug)
const PagesTop = Object.values(import.meta.glob<Component>('~/components/pages/Top.vue', { eager: true, import: 'default' }))[0]
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
    <BlockPageHeader :title="page.data.title" :lead="page.data.summary">
      <Button v-if="action" as-child size="lg" class="self-start max-sm:self-stretch">
        <a :href="action.href">{{ action.label }}</a>
      </Button>
    </BlockPageHeader>
    <component :is="PagesTop" v-if="PagesTop" :id="page.id" />
    <div v-if="page.data.image" class="mx-auto max-w-page px-gutter pb-10">
      <GinkoImage :image="page.data.image" eager sizes="(min-width: 1216px) 1152px, 100vw" class="aspect-video w-full rounded-block bg-muted object-cover" />
    </div>
    <ProseBody :value="page.data.body" />
  </article>
</template>
