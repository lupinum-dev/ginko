<!-- Synced from templates/_features/pages/app/pages/[...slug].vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// A page of content/pages/ at /<slug> (in other languages /<code>/<slug>). An unknown address is a real 404.
const route = useRoute()
const page = useGinkoEntry('pages', () => route.params.slug)
usePageSeo(() => ({
  title: page.value.data.title,
  description: page.value.data.summary,
  image: page.value.data.image,
}))
</script>

<template>
  <article>
    <BlockPageHeader :title="page.data.title" :lead="page.data.summary" />
    <div v-if="page.data.image" class="mx-auto max-w-page px-gutter pb-10">
      <GinkoImage :image="page.data.image" eager sizes="(min-width: 1216px) 1152px, 100vw" class="aspect-video w-full rounded-block bg-muted object-cover" />
    </div>
    <ProseBody :value="page.data.body" />
  </article>
</template>
