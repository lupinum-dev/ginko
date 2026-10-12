<script setup lang="ts">
// ::steps: every heading directly inside starts a step; the marker is a CSS counter (or a check), see interactive.css.
defineProps<{ mode?: string; appearance?: 'quiet' | 'tint' }>()
</script>

<template>
  <div class="ginko-steps" :data-mode="mode === 'check' ? 'check' : 'numbered'" :data-appearance="appearance"><slot /></div>
</template>
