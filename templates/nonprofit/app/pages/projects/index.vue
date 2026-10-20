<!-- Synced from templates/_features/projects/app/pages/projects/index.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import type { Component } from 'vue'

// The projects and campaigns in their order (content/projects/). The address per language comes from
// `pages.projects` in ginko.config.ts. A template may bring `app/components/projects/List.vue` (prop `items`: the
// visible projects); the page then shows it instead of the cards (for example the work as large photos).
const List = Object.values(import.meta.glob<Component>('~/components/projects/List.vue', { eager: true, import: 'default' }))[0]
const projects = useGinko('projects')
const cards = useProjectCards()
const { t } = useI18n('projects')
usePageSeo(() => ({ title: t('title'), description: t('lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <component :is="List" v-if="List && projects.items.length" :items="projects.items" />
      <BlockCards v-else-if="cards.length" :items="cards" heading-level="h2" eager />
      <BlockEmpty v-else :title="t('empty')" path="content/projects/" />
    </div>
  </div>
</template>
