<!-- Synced from templates/_features/site/app/components/block/PageHeader.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
/** The first section of every page except home: the page's one h1, an optional lead and a meta line (a date). */
defineProps<{
  title: string
  lead?: string
  meta?: string
}>()
</script>

<template>
  <header class="mx-auto max-w-page px-gutter pt-12 pb-8 md:pt-20 md:pb-12">
    <div class="flex max-w-3xl flex-col gap-5">
      <h1 class="text-h1">{{ title }}</h1>
      <p v-if="lead" class="text-lead text-muted-foreground">{{ lead }}</p>
      <p v-if="meta" class="text-small text-muted-foreground tabular-nums">{{ meta }}</p>
    </div>
  </header>
</template>
