<script setup lang="ts">
defineProps<{ label?: string }>()
</script>

<template>
  <aside class="ginko-aside">
    <p v-if="label" class="ginko-label">{{ label }}</p>
    <div class="ginko-aside-body"><slot /></div>
  </aside>
</template>
