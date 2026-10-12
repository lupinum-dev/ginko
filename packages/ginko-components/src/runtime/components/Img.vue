<script setup lang="ts">
// The renderer for `img` (a plain Markdown tag, so no registry entry). ginko-content gives every image of a page its
// pixel size; with `width` and `height` the browser reserves the space before the image loads.
defineProps<{ src?: string; alt?: string; width?: number | string; height?: number | string }>()
</script>

<template>
  <img class="ginko-img" :src="src" :alt="alt ?? ''" :width="width" :height="height" loading="lazy" decoding="async">
</template>
