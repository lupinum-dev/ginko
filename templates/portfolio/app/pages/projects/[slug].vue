<!-- Synced from templates/_features/projects/app/pages/projects/[slug].vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { Component } from 'vue'
import { safeHref } from '@lupinum/ginko'

// One project: title, summary, for a campaign its last day, an optional button (`actionLabel`, `actionUrl`), photo
// (3:2) and text. A template may bring `app/components/projects/Body.vue` (prop `project`); the page then shows it
// below the title instead of the photo and the text (the portfolio: facts, photos with the lightbox, the next project).
const Body = Object.values(import.meta.glob<Component>('~/components/projects/Body.vue', { eager: true, import: 'default' }))[0]
const route = useRoute()
const project = useGinkoEntry('projects', () => route.params.slug)
const { t, format } = useI18n('projects')
const action = computed(() => {
  const href = safeHref(project.value.data.actionUrl)
  return href && project.value.data.actionLabel ? { label: project.value.data.actionLabel, href } : undefined
})
usePageSeo(() => ({
  title: project.value.data.title,
  description: project.value.data.summary,
  image: project.value.data.image,
}))
</script>

<template>
  <article>
    <BlockPageHeader
      :title="project.data.title"
      :lead="project.data.summary"
      :meta="project.data.ends ? t('until', { date: format.date(project.data.ends) }) : undefined"
    >
      <Button v-if="action" as-child size="lg" class="self-start max-sm:self-stretch">
        <a :href="action.href">{{ action.label }}</a>
      </Button>
    </BlockPageHeader>
    <component :is="Body" v-if="Body" :project="project" />
    <template v-else>
      <div v-if="project.data.image" class="mx-auto max-w-page px-gutter pb-10">
        <GinkoImage :image="project.data.image" eager sizes="(min-width: 1216px) 896px, 100vw" class="aspect-3/2 w-full max-w-4xl rounded-block bg-muted object-cover" />
      </div>
      <ProseBody :value="project.data.body" />
    </template>
  </article>
</template>
