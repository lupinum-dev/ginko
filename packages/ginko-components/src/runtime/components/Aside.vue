<script setup lang="ts">
defineProps<{ label?: string; appearance?: 'quiet' | 'tint' }>()
</script>

<template>
  <aside class="ginko-aside" :data-appearance="appearance">
    <p v-if="label" class="ginko-label">{{ label }}</p>
    <div class="ginko-aside-body"><slot /></div>
  </aside>
</template>
