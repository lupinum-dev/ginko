<script setup lang="ts">
defineProps<{ size?: string; align?: string; fit?: string }>()
</script>

<template>
  <div class="ginko-column" :data-size="size || 'md'" :data-align="align" :data-media="fit || 'natural'">
    <div class="ginko-column-inner"><slot /></div>
  </div>
</template>
