<script setup lang="ts">
defineProps<{ type?: string; align?: string; gap?: string; stack?: string; surface?: string }>()
</script>

<template>
  <div class="ginko-layout">
    <div class="ginko-layout-row" :data-type="type || 'default'" :data-align="align" :data-gap="gap || 'md'" :data-stack="stack || 'md'" :data-surface="surface || 'default'"><slot /></div>
  </div>
</template>
