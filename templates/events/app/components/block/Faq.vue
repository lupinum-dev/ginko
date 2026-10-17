<!-- Synced from templates/_features/faq/app/components/block/Faq.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
/**
 * Questions and answers as an accordion (one open at a time). Inside BlockSection, whose h2 is the label, the
 * questions are h3 (the default); a page that lists them right under its h1 passes `level` 2, so no heading level is
 * skipped. Pass `faqJsonLd(items)` from @lupinum/ginko/basics to the page's usePageSeo({ jsonLd }) for the FAQPage.
 */
withDefaults(defineProps<{ items: { id: string, question: string, answer: string }[], level?: 2 | 3 }>(), { level: 3 })
</script>

<template>
  <Accordion type="single" collapsible class="border-t">
    <AccordionItem v-for="item in items" :key="item.id" :value="item.id">
      <AccordionTrigger :heading-level="level === 2 ? 'h2' : 'h3'">{{ item.question }}</AccordionTrigger>
      <AccordionContent class="whitespace-pre-line">{{ item.answer }}</AccordionContent>
    </AccordionItem>
  </Accordion>
</template>
