<!-- Synced from templates/_features/site/app/components/site/Notice.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
import { Info } from '@lucide/vue'

// The owner's notices (content/notices/): every active one (the notices brick allows 5), in the owner's order, so
// the newest goes first. A notice with "Shown until" leaves the site after that day by itself. There is no dismiss
// button: owners end notices by date.
const notices = useGinko('notices')
const { t } = useI18n('site')
</script>

<template>
  <section v-if="notices.items.length" :aria-label="t('notice')" class="bg-muted print:hidden">
    <ul class="mx-auto flex max-w-page flex-col gap-1 px-gutter py-2.5">
      <li v-for="notice in notices.items" :key="notice.id" class="flex items-start gap-2.5 text-small">
        <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>{{ notice.data.text }}</p>
      </li>
    </ul>
  </section>
</template>
