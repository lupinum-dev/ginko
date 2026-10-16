<!-- Synced from templates/_features/events/app/pages/events/index.vue by `pnpm templates sync`. Edit the source, not this copy. -->
<script setup lang="ts">
// Upcoming events (content/events/), the next first, with weekday, date, time, price and "fully booked". An event
// leaves this list, the sitemap and search engines after its last day. The cards' titles are h3: a hidden h2 keeps the
// heading order (h1, h2, h3) for screen readers.
const cards = useUpcomingEvents()
const { t } = useI18n('events')
usePageSeo(() => ({ title: t('title'), description: t('lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <h2 v-if="cards.length" class="sr-only">{{ t('upcoming') }}</h2>
      <BlockCards v-if="cards.length" :items="cards" :columns="3" />
      <p v-else class="max-w-prose text-lead text-muted-foreground">{{ t('none') }}</p>
    </div>
  </div>
</template>
