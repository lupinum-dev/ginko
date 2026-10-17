<script setup lang="ts">
/** The closing band of a page, on the accent colour: one sentence and one action. At most one per page; never on
 *  legal, contact or error pages. The slot takes one more line below the text, such as the next date. */
defineProps<{
  title: string
  text?: string
  action: { label: string, to: string }
}>()
const titleId = useId()
</script>

<template>
  <section :aria-labelledby="titleId" class="mx-auto max-w-page px-gutter pt-section print:hidden">
    <div class="surface-primary flex flex-col gap-8 rounded-block px-6 py-12 sm:px-12 md:flex-row md:items-end md:justify-between md:py-16">
      <div class="flex max-w-2xl flex-col gap-4">
        <h2 :id="titleId" class="text-h2">{{ title }}</h2>
        <p v-if="text" class="text-lead text-muted-foreground">{{ text }}</p>
        <slot />
      </div>
      <Button as-child size="lg" class="shrink-0 max-sm:w-full">
        <NuxtLink :to="action.to">{{ action.label }}</NuxtLink>
      </Button>
    </div>
  </section>
</template>
