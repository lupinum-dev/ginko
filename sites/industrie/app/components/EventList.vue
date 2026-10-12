<!-- Upcoming trade fairs: a table on desktop, stacked rows on phones. `limit` shortens it on the home page. -->
<script setup lang="ts">
const { t, format } = useI18n()

const props = defineProps<{ limit?: number }>()
const { lang } = useSite()
const events = useGinko('events')
const items = computed(() => (props.limit ? events.value.items.slice(0, props.limit) : events.value.items))
</script>

<template>
  <table v-if="items.length" class="rules events">
    <thead>
      <tr><th scope="col">{{ t('period') }}</th><th scope="col">{{ t('fair') }}</th><th scope="col">{{ t('place') }}</th><th scope="col">{{ t('booth') }}</th></tr>
    </thead>
    <tbody>
      <tr v-for="e in items" :key="e.id" data-test="event">
        <td class="mono when">{{ format.range(e.data.when.from, e.data.when.to) }}</td>
        <th scope="row" class="fair" :lang="ginkoLangOf(e, 'title')">{{ e.data.title }}</th>
        <td class="place">{{ e.data.location }}</td>
        <td class="mono booth" :data-label="t('booth')">{{ e.data.booth }}</td>
      </tr>
    </tbody>
  </table>
  <p v-else class="empty">{{ t('noEvents') }}</p>
</template>

<style scoped>
.events th[scope='row'] { font-weight: 500; }
.events td.when { white-space: nowrap; }
@media (max-width: 719px) {
  .events thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .events, .events tbody, .events tr, .events td, .events th { display: block; }
  .events tr { padding: 12px 0; border-bottom: 1px solid var(--rule); }
  .events td, .events th { border: 0; padding: 0; }
  .events td.booth:empty { display: none; }
  .events td.booth::before { content: attr(data-label) ' '; font-family: var(--sans); color: var(--ink-2); }
  .events td.place { color: var(--ink-2); }
}
@media (min-width: 720px) {
  .events th[scope='col']:first-child, .events td.when { width: 15rem; }
}
</style>
