<script setup lang="ts">
defineProps<{ size?: string; frame?: string }>()
</script>

<template>
  <div class="ginko-center">
    <div class="ginko-center-inner" :data-size="size || 'md'" :data-frame="frame || 'none'"><slot /></div>
  </div>
</template>
