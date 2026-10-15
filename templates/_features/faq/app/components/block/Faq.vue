<script setup lang="ts">
/**
 * Questions and answers as an accordion (one open at a time). Use inside BlockSection, whose h2 is the label, and
 * pass `faqJsonLd(items)` from @lupinum/ginko/basics to the page's usePageSeo({ jsonLd }) for the FAQPage.
 */
defineProps<{ items: { id: string, question: string, answer: string }[] }>()
</script>

<template>
  <Accordion type="single" collapsible class="border-t">
    <AccordionItem v-for="item in items" :key="item.id" :value="item.id">
      <AccordionTrigger>{{ item.question }}</AccordionTrigger>
      <AccordionContent class="whitespace-pre-line">{{ item.answer }}</AccordionContent>
    </AccordionItem>
  </Accordion>
</template>
