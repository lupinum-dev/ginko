<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

// Shown by the pricing feature below the plans: the first three questions of content/faq/ (billing, cancellation and
// data export come first there) and a link to all questions. The FAQ page carries the FAQPage data for search engines.
const questions = useGinko('faq')
const path = useGinkoPath()
const { t } = useI18n()
const items = computed(() => questions.value.items.slice(0, 3).map((item) => ({ id: item.id, question: item.data.question, answer: item.data.answer })))
</script>

<template>
  <BlockSection v-if="items.length" :title="t('pricing.questions')">
    <div class="flex flex-col gap-6">
      <BlockFaq :items="items" />
      <NuxtLink :to="path('faq')" class="inline-flex min-h-11 items-center gap-2 self-start font-medium text-primary underline-offset-4 hover:underline">
        {{ t('pricing.allQuestions') }}<ArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </NuxtLink>
    </div>
  </BlockSection>
</template>
