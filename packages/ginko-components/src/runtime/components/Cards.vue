<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ cols?: string | number }>()
const columns = computed(() => Math.min(3, Math.max(1, Number(props.cols) || 2)))
</script>

<template>
  <div class="ginko-cards" :data-columns="columns"><slot /></div>
</template>
