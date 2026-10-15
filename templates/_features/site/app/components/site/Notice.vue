<script setup lang="ts">
import { Info } from '@lucide/vue'

// The owner's notices (content/notices/): at most two, in the owner's order, so the newest goes first. A notice
// with "Shown until" leaves the site after that day by itself. There is no dismiss button: owners end notices by date.
const notices = useGinko('notices')
const shown = computed(() => notices.value.items.slice(0, 2))
const { t } = useI18n('site')
</script>

<template>
  <section v-if="shown.length" :aria-label="t('notice')" class="bg-muted">
    <ul class="mx-auto flex max-w-page flex-col gap-1 px-gutter py-2.5">
      <li v-for="notice in shown" :key="notice.id" class="flex items-start gap-2.5 text-small">
        <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>{{ notice.data.text }}</p>
      </li>
    </ul>
  </section>
</template>
