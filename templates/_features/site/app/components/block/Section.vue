<script setup lang="ts">
/**
 * A section with a short label as heading, an optional lead, and the content in the slot. `side`: from `lg` the
 * heading takes 4 of 12 columns and the content 8; otherwise the content runs below the heading at full width.
 * The label is `text-h3`, the size of a Markdown `##`, so every h2 of a page has one size (only BlockCta's sentence
 * is larger).
 */
withDefaults(defineProps<{
  title: string
  lead?: string
  id?: string
  side?: boolean
}>(), { side: true })
const titleId = useId()
</script>

<template>
  <section :id="id" :aria-labelledby="titleId" class="mx-auto max-w-page px-gutter pt-section">
    <div :class="side ? 'grid gap-8 lg:grid-cols-12 lg:gap-16' : 'flex flex-col gap-10'">
      <div class="flex max-w-2xl flex-col gap-4" :class="side && 'lg:col-span-4'">
        <h2 :id="titleId" class="text-h3">{{ title }}</h2>
        <p v-if="lead" class="text-muted-foreground">{{ lead }}</p>
      </div>
      <div class="min-w-0" :class="side && 'lg:col-span-8'">
        <slot />
      </div>
    </div>
  </section>
</template>
