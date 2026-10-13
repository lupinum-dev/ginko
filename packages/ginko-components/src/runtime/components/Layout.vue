<script setup lang="ts">
defineProps<{ frame?: string; align?: string; gap?: string; stack?: string; background?: string }>()
</script>

<template>
  <div class="ginko-layout">
    <div class="ginko-layout-row" :data-frame="frame || 'none'" :data-align="align" :data-gap="gap || 'md'" :data-stack="stack || 'md'" :data-background="background || 'none'"><slot /></div>
  </div>
</template>
