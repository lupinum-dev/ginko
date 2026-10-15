<script setup lang="ts">
// One legal text (content/legal/): privacy policy, terms, imprint. Address: /legal/<slug> in every language.
const route = useRoute()
const entry = useGinkoEntry('legal', () => route.params.slug)
const { t, format } = useI18n('site')
usePageSeo(() => ({ title: entry.value.data.title, description: entry.value.data.description }))
</script>

<template>
  <div>
    <BlockPageHeader
      :title="entry.data.title"
      :lead="entry.data.description"
      :meta="t('updated', { date: format.date(entry.data.updatedAt) })"
    />
    <ProseBody :value="entry.data.body" />
  </div>
</template>
