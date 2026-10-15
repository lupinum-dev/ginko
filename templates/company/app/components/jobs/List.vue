<!-- Synced from templates/_features/jobs/app/components/jobs/List.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'

/** Open jobs as rows divided by lines: the title (a link over the whole row), the short description, and place,
 *  employment and the last day to apply in tabular numbers. `headingLevel`: h2 when the list follows the page's h1. */
withDefaults(defineProps<{
  items: { key: string, title: string, to: string, text?: string, meta: string }[]
  headingLevel?: 'h2' | 'h3'
}>(), { headingLevel: 'h2' })
</script>

<template>
  <ul class="flex flex-col border-b">
    <li v-for="job in items" :key="job.key" class="group relative flex items-start gap-4 border-t py-6">
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <component :is="headingLevel" class="text-h3">
          <NuxtLink :to="job.to" class="underline-offset-4 after:absolute after:inset-0 group-hover:underline">{{ job.title }}</NuxtLink>
        </component>
        <p v-if="job.text" class="text-muted-foreground">{{ job.text }}</p>
        <p class="text-small text-muted-foreground tabular-nums">{{ job.meta }}</p>
      </div>
      <ArrowRight class="mt-1 size-5 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
    </li>
  </ul>
</template>
