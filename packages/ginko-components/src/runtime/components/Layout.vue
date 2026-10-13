<script setup lang="ts">
defineProps<{ frame?: string; align?: string; gap?: string; stack?: string; surface?: string }>()
</script>

<template>
  <div class="ginko-layout">
    <div class="ginko-layout-row" :data-type="frame || 'default'" :data-align="align" :data-gap="gap || 'md'" :data-stack="stack || 'md'" :data-surface="surface || 'default'"><slot /></div>
  </div>
</template>
