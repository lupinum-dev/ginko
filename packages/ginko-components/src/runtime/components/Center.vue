<script setup lang="ts">
defineProps<{ size?: string; frame?: string }>()
</script>

<template>
  <div class="ginko-center">
    <div class="ginko-center-inner" :data-size="size || 'md'" :data-type="frame || 'default'"><slot /></div>
  </div>
</template>
