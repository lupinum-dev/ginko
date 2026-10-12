<script setup lang="ts">
defineProps<{ width?: string; surface?: string }>()
</script>

<template>
  <div class="ginko-flow" :data-surface="surface || 'default'">
    <div class="ginko-flow-track">
      <div class="ginko-flow-body" :data-width="width === 'wide' ? 'wide' : 'reading'"><slot /></div>
    </div>
  </div>
</template>
