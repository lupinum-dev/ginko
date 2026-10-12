<script setup lang="ts">
const { format } = useI18n()
const props = defineProps<{ limit?: number }>()
const events = useGinko('events')
const items = computed(() => (props.limit ? events.value.items.slice(0, props.limit) : events.value.items))
</script>

<template>
  <ul v-if="items.length" class="list">
    <li v-for="event in items" :key="event.id">
      <h3><NuxtLink :to="event.url">{{ event.data.title }}</NuxtLink></h3>
      <p class="meta">{{ format.range(event.data.when.from, event.data.when.to, 'long') }} · {{ event.data.place }}</p>
    </li>
  </ul>
  <p v-else>No upcoming events.</p>
</template>
