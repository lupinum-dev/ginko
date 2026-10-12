<script setup lang="ts">
defineProps<{ label?: string; source?: string; size?: string }>()
</script>

<template>
  <figure class="ginko-excerpt" :data-size="size === 'display' ? 'display' : 'body'">
    <p v-if="label" class="ginko-label">{{ label }}</p>
    <blockquote class="ginko-excerpt-body"><slot /></blockquote>
    <figcaption v-if="source" class="ginko-excerpt-source">{{ source }}</figcaption>
  </figure>
</template>
