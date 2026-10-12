<script setup lang="ts">
import { computed } from 'vue'

// Attributes arrive as strings.
const props = defineProps<{ lines?: number | string }>()
const lines = computed(() => {
  const n = Math.round(Number(props.lines))
  return Number.isFinite(n) && n >= 2 && n <= 4 ? n : 2
})
</script>

<template>
  <div class="ginko-dropcap" :style="{ '--ginko-dropcap-lines': String(lines) }"><slot /></div>
</template>
