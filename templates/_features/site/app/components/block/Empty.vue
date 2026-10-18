<script setup lang="ts">
import { FilePlus } from '@lucide/vue'

/** An empty list: what to add, and in files mode where (`path`, for example `content/pages/`). The path is for the
 *  owner: it shows in development only (`npm run dev`), never to visitors of the built site. */
defineProps<{
  title: string
  text?: string
  path?: string
}>()
const dev = import.meta.dev
</script>

<template>
  <div class="flex flex-col items-start gap-3 rounded-block border border-dashed p-8">
    <FilePlus class="size-6 text-muted-foreground" aria-hidden="true" />
    <p class="text-body font-medium">{{ title }}</p>
    <p v-if="text" class="text-muted-foreground">{{ text }}</p>
    <p v-if="path && dev" class="text-small text-muted-foreground">
      <I18nT k="site.empty" :params="{ path }">
        <template #code="{ text: file }"><code>{{ file }}</code></template>
      </I18nT>
    </p>
  </div>
</template>
