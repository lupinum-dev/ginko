<script setup lang="ts">
defineProps<{ width?: string; frame?: string }>()
</script>

<template>
  <div class="ginko-center">
    <div class="ginko-center-inner" :data-width="width || 'md'" :data-frame="frame || 'none'"><slot /></div>
  </div>
</template>
