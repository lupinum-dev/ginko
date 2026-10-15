<script setup lang="ts">
import type { MarkdownValue } from '@lupinum/ginko'

/** A Markdown body (headings start at h2); with @lupinum/ginko-components installed, also its components. */
defineProps<{ value: MarkdownValue | undefined }>()
</script>

<template>
  <div class="mx-auto max-w-page px-gutter">
    <GinkoMarkdown :value="value" class="prose" />
  </div>
</template>
