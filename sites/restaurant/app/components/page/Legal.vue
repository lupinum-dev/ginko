<script setup lang="ts">
const props = defineProps<{ field: 'imprint' | 'privacy' }>()
const { t } = useI18n()
const legal = useGinko('legal')
const title = computed(() => (props.field === 'imprint' ? t('imprint') : t('privacy')))
useSeoMeta({ title: () => `${title.value} | Gasthaus zur Linde` })
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ title }}</h1>
    <GinkoMarkdown :value="legal.data[field]" class="prose body" :lang="ginkoLangOf(legal, field)" />
  </div>
</template>

<style scoped>
.body { margin-top: 24px; }
</style>
