<script setup lang="ts">
defineProps<{ title?: string; source?: string; size?: string; appearance?: 'quiet' | 'tint' }>()
</script>

<template>
  <figure class="ginko-excerpt" :data-size="size === 'display' ? 'display' : 'body'" :data-appearance="appearance">
    <p v-if="title" class="ginko-label">{{ title }}</p>
    <blockquote class="ginko-excerpt-body"><slot /></blockquote>
    <figcaption v-if="source" class="ginko-excerpt-source">{{ source }}</figcaption>
  </figure>
</template>
