<script setup lang="ts">
import { tagLabel } from '../utils/site'

// A changelog tag. A value this site does not know yet shows as it is, in the neutral outline (choice fallback).
defineProps<{ value: string }>()
const { labels } = useSite()
</script>

<template>
  <span class="chip" :class="value">{{ tagLabel(value, labels.tags) }}</span>
</template>
