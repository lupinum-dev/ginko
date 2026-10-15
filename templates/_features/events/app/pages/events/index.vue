<script setup lang="ts">
// Upcoming events (content/events/), the next first, with weekday, date, time, price and "fully booked". An event
// leaves this list, the sitemap and search engines after its last day.
const cards = useUpcomingEvents()
const { t } = useI18n('events')
usePageSeo(() => ({ title: t('title'), description: t('lead') }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('title')" :lead="t('lead')" />
    <div class="mx-auto max-w-page px-gutter">
      <BlockCards v-if="cards.length" :items="cards" :columns="3" />
      <p v-else class="max-w-prose text-lead text-muted-foreground">{{ t('none') }}</p>
    </div>
  </div>
</template>
