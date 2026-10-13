<script setup lang="ts">
const langOf = useGinkoLang()
const { t } = useI18n()

const props = defineProps<{ field: 'imprint' | 'privacy' }>()
const { head } = useSite()
const legal = useGinko('legal')
const title = computed(() => (props.field === 'imprint' ? t('imprint') : t('privacy')))
head(() => title.value, props.field)
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ title }}</h1>
    <GinkoMarkdown :value="legal.data[field]" class="prose body" :lang="langOf(legal, field)" />
  </div>
</template>

<style scoped>
.body { margin-top: 24px; }
</style>
