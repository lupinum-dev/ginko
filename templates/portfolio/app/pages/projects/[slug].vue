<!-- Synced from templates/_features/projects/app/pages/projects/[slug].vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { Component } from 'vue'
import { safeHref } from '@lupinum/ginko'

// One project: title, summary, for a campaign its last day, an optional button (`actionLabel`, `actionUrl`), photo
// (3:2) and text. Two hooks of the template: `app/components/projects/Body.vue` (prop `project`) is shown below the
// title instead of the photo and the text (for example the facts and every photo of a project); the composable
// `app/composables/useProjectJsonLd.ts` (`useProjectJsonLd()` returns a function of the project) adds the project's
// own JSON-LD, such as a CreativeWork, to the page's one `usePageSeo` call.
const Body = Object.values(import.meta.glob<Component>('~/components/projects/Body.vue', { eager: true, import: 'default' }))[0]
type ProjectJsonLd = () => (project: GinkoItem<'projects'>) => Record<string, unknown>
const projectJsonLd = Object.values(import.meta.glob<ProjectJsonLd>('~/composables/useProjectJsonLd.ts', { eager: true, import: 'useProjectJsonLd' }))[0]?.()
const route = useRoute()
const project = useGinkoEntry('projects', () => route.params.slug)
const { t, format } = useI18n('projects')
const campaign = computed(() => projectCampaign(project.value.data))
const action = computed(() => {
  const href = safeHref(campaign.value.actionUrl)
  return href && campaign.value.actionLabel ? { label: campaign.value.actionLabel, href } : undefined
})
usePageSeo(() => ({
  title: project.value.data.title,
  description: project.value.data.summary,
  image: project.value.data.image,
  jsonLd: projectJsonLd ? [projectJsonLd(project.value)] : undefined,
}))
</script>

<template>
  <article>
    <BlockPageHeader
      :title="project.data.title"
      :lead="project.data.summary"
      :meta="campaign.ends ? t('until', { date: format.date(campaign.ends) }) : undefined"
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
