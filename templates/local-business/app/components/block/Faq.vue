<!-- Synced from templates/_features/faq/app/components/block/Faq.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
/**
 * Questions and answers as an accordion (one open at a time). Inside BlockSection, whose h2 is the label, the questions
 * are h3 (the default); on a page of their own, pass `heading-level="h2"`. Pass `faqJsonLd(items)` from
 * @lupinum/ginko/basics to the page's usePageSeo({ jsonLd }) for the FAQPage. Closed answers stay in the page (hidden
 * until found), so the browser's search finds them and a printed page shows them all.
 */
withDefaults(defineProps<{ items: { id: string, question: string, answer: string }[], headingLevel?: 'h2' | 'h3' }>(), { headingLevel: 'h3' })
</script>

<template>
  <Accordion type="single" collapsible :unmount-on-hide="false" class="border-t">
    <AccordionItem v-for="item in items" :key="item.id" :value="item.id">
      <AccordionTrigger :heading-level="headingLevel">{{ item.question }}</AccordionTrigger>
      <AccordionContent class="whitespace-pre-line">{{ item.answer }}</AccordionContent>
    </AccordionItem>
  </Accordion>
</template>
