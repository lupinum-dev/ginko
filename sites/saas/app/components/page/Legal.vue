<script setup lang="ts">
import { legalPages, type LegalKey } from '../../utils/site'

const langOf = useGinkoLang()

// AGB, AVV, privacy and imprint: written by hand in every language (translate: 'manual'). A language without
// its own text shows the main language's text, marked with its `lang`.
const props = defineProps<{ field: LegalKey }>()
const { labels } = useSite()
const page = legalPages[props.field]
usePageSeo(page)
const legal = useGinko('legal')
</script>

<template>
  <div class="wrap page-body">
    <h1 class="page-title">{{ labels.pages[page].title }}</h1>
    <GinkoMarkdown :value="legal.data[field]" class="prose body" :lang="langOf(legal, field)" />
  </div>
</template>

<style scoped>
.body { margin-top: 28px; }
</style>
