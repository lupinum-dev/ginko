<script setup lang="ts">
import { computed, getCurrentInstance, type Component } from 'vue'

// An icon the author names (`lucide:book-open`, or `book-open` for Lucide) on a card, tab, link or timeline entry.
// It renders through the site's global <Icon> (@nuxt/icon, which the docs preset includes); a site without it shows
// no icon instead of an error.
const props = defineProps<{ name: string }>()
const Icon = getCurrentInstance()?.appContext.components.Icon as Component | undefined
const full = computed(() => (props.name.includes(':') || props.name.startsWith('i-') ? props.name : `lucide:${props.name}`))
</script>

<template>
  <component :is="Icon" v-if="Icon" :name="full" class="ginko-site-icon" aria-hidden="true" />
</template>
