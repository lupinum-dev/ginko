<script setup lang="ts">
const { format } = useI18n()
const route = useRoute()
const path = useGinkoPath()
const event = useGinkoEntry('events', String(route.params.slug))
useGinkoSeo(() => ({ title: event.value.data.title, description: `${format.range(event.value.data.when.from, event.value.data.when.to, 'long')}, ${event.value.data.place}` }))
</script>

<template>
  <article class="column">
    <p><NuxtLink :to="path('events')">All events</NuxtLink></p>
    <h1>{{ event.data.title }}</h1>
    <p class="meta">{{ format.range(event.data.when.from, event.data.when.to, 'long') }} · {{ event.data.place }}</p>
    <GinkoMarkdown :value="event.data.description" class="prose" />
  </article>
</template>
