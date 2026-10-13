<script setup lang="ts">
defineProps<{ title?: string; appearance?: 'quiet' | 'tint' }>()
</script>

<template>
  <aside class="ginko-aside" :data-appearance="appearance">
    <p v-if="title" class="ginko-label">{{ title }}</p>
    <div class="ginko-aside-body"><slot /></div>
  </aside>
</template>
