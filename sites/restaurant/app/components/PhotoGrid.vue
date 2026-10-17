<!-- Photos with their alt text. `strip` is the short row on the home page; otherwise a masonry of all.
     GinkoImage writes a srcset from the platform's smaller copies, so a phone does not load the original.
     Only the masonry's first row loads at once (with high priority): the strip sits far below the first screen. -->
<script setup lang="ts">
import { safeHref, type ImageValue } from '@lupinum/ginko'

const langOf = useGinkoLang()
const props = defineProps<{ images: readonly { _id: string; image: ImageValue }[]; strip?: boolean; fallback?: readonly string[] }>()
// How wide a photo shows: the strip has 2 columns, 4 from 900px; the masonry 1 column, 2 from 30rem (at most half of the 72rem page).
const sizes = computed(() => (props.strip ? '(min-width: 900px) 25vw, 50vw' : '(min-width: 30rem) min(50vw, 36rem), 100vw'))
/** Only photos with an http(s) address: content never brings another scheme into the page. */
// A row whose photo is missing (an upload removed on the platform) is left out too.
const shown = computed(() => props.images.filter((row) => safeHref(row.image?.url)))
</script>

<template>
  <ul :class="['photos', { strip }]">
    <li v-for="(row, i) in shown" :key="row._id">
      <GinkoImage :image="row.image" :sizes="sizes" :eager="!strip && i < 2" :lang="langOf({ fallback }, `images.${row._id}.image.alt`)" />
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
