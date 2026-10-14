<!-- Photos with their alt text. `strip` is the short row on the home page; otherwise a masonry of all. -->
<script setup lang="ts">
import { safeHref } from '@lupinum/ginko'

const langOf = useGinkoLang()
const props = defineProps<{ images: readonly { _id: string; image: { url: string; alt: string; width?: number; height?: number } }[]; strip?: boolean; fallback?: readonly string[] }>()
/** Only photos with an http(s) address: content never brings another scheme into the page. */
// A row whose photo is missing (an upload removed on the platform) is left out too.
const shown = computed(() => props.images.filter((row) => safeHref(row.image?.url)))
</script>

<template>
  <ul :class="['photos', { strip }]">
    <li v-for="(row, i) in shown" :key="row._id">
      <img :src="row.image.url" :alt="row.image.alt" :lang="langOf({ fallback }, `images.${row._id}.image.alt`)" :width="row.image.width" :height="row.image.height" :loading="i < 2 ? 'eager' : 'lazy'" decoding="async">
    </li>
  </ul>
</template>

<style scoped>
.photos { list-style: none; margin: 0; padding: 0; columns: 2 12rem; column-gap: 12px; }
.photos li { break-inside: avoid; margin-bottom: 12px; }
img { width: 100%; border-radius: 10px; background: var(--paper-2); }
.strip { columns: auto; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.strip li { margin: 0; }
.strip img { aspect-ratio: 4 / 3; object-fit: cover; height: 100%; }
@media (min-width: 900px) { .strip { grid-template-columns: repeat(4, 1fr); } }
</style>
