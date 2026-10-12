<script setup lang="ts">
/* eslint-disable vue/no-v-html -- constant markup from icons.ts and file-icons.ts */
import { ICONS, type IconName } from './icons'

// The one svg wrapper: a Lucide glyph by `name` (stroke attributes set here), or a multicolour mark with its own
// `viewBox` and `body`. The caller adds the size through a class.
defineProps<{ name?: IconName; viewBox?: string; body?: string }>()
</script>

<template>
  <svg v-if="body" :viewBox="viewBox" aria-hidden="true" v-html="body" />
  <svg v-else-if="name" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="ICONS[name]" />
</template>
