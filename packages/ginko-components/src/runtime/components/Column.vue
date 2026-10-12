<script setup lang="ts">
defineProps<{ size?: string; align?: string; media?: string }>()
</script>

<template>
  <div class="ginko-column" :data-size="size || 'md'" :data-align="align" :data-media="media || 'natural'">
    <div class="ginko-column-inner"><slot /></div>
  </div>
</template>
