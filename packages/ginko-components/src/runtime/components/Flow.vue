<script setup lang="ts">
defineProps<{ width?: string; background?: string }>()
</script>

<template>
  <div class="ginko-flow" :data-background="background || 'none'">
    <div class="ginko-flow-track">
      <div class="ginko-flow-body" :data-width="width === 'wide' ? 'wide' : 'reading'"><slot /></div>
    </div>
  </div>
</template>
