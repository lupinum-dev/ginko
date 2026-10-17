<script setup lang="ts">
import { faqJsonLd } from '@lupinum/ginko/basics'

// Questions and answers (content/faq/), in the owner's order, as an accordion, with FAQPage JSON-LD. The address per
// language comes from `pages.faq` in ginko.config.ts.
const questions = useGinko('faq')
const { t } = useI18n()
const items = computed(() => questions.value.items.map((item) => ({ id: item.id, question: item.data.question, answer: item.data.answer })))
usePageSeo(() => ({ title: t('faq.title'), description: t('faq.lead'), jsonLd: items.value.length ? [faqJsonLd(items.value)] : [] }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('faq.title')" :lead="t('faq.lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <div class="max-w-3xl">
        <BlockFaq v-if="items.length" :items="items" :level="2" />
        <BlockEmpty v-else :title="t('faq.empty')" path="content/faq/" />
      </div>
    </div>
  </div>
</template>
