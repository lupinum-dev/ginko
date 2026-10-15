<!-- Synced from templates/_features/downloads/app/pages/downloads.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// Documents to download, newest first (content/downloads/, the files in public/). The address per language comes
// from `pages.downloads` in ginko.config.ts.
const downloads = useGinko('downloads')
const { t } = useI18n('downloads')
usePageSeo(() => ({ title: t('title'), description: t('lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <div class="max-w-4xl">
        <DownloadsList v-if="downloads.items.length" :items="downloads.items" />
        <BlockEmpty v-else :title="t('empty')" path="content/downloads/" />
      </div>
    </div>
  </div>
</template>
