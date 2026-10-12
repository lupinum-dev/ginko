<script setup lang="ts">
defineProps<{ size?: string; type?: string }>()
</script>

<template>
  <div class="ginko-center">
    <div class="ginko-center-inner" :data-size="size || 'md'" :data-type="type || 'default'"><slot /></div>
  </div>
</template>
