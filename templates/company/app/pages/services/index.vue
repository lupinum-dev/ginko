<!-- Synced from templates/_features/services/app/pages/services/index.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// The services or products in their order (content/services/), each with its price or "On request" and its
// duration. The address per language comes from `pages.services` in ginko.config.ts.
const cards = useServiceCards()
const { t } = useI18n('services')
usePageSeo(() => ({ title: t('title'), description: t('lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <BlockCards v-if="cards.length" :items="cards" heading-level="h2" eager />
      <BlockEmpty v-else :title="t('empty')" path="content/services/" />
    </div>
  </div>
</template>
