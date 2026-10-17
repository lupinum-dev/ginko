<!-- Synced from templates/_features/projects/app/pages/projects/index.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// The projects and campaigns in their order (content/projects/). The address per language comes from
// `pages.projects` in ginko.config.ts.
const cards = useProjectCards()
const { t } = useI18n('projects')
usePageSeo(() => ({ title: t('title'), description: t('lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <BlockCards v-if="cards.length" :items="cards" heading-level="h2" />
      <BlockEmpty v-else :title="t('empty')" path="content/projects/" />
    </div>
  </div>
</template>
