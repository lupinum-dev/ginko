<script setup lang="ts">
import { computed } from 'vue'

const COLORS = ['neutral', 'primary', 'success', 'warning', 'danger']
const props = defineProps<{ color?: string }>()
const color = computed(() => (props.color && COLORS.includes(props.color) ? props.color : 'neutral'))
</script>

<template>
  <span class="ginko-badge" :data-color="color"><slot /></span>
</template>
