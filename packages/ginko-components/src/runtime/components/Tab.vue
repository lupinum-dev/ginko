<script setup lang="ts">
// One panel of ::tabs. <Tabs> reads `title` and `icon` from this component's props and builds the tab around it.
defineProps<{ title?: string; icon?: string }>()
</script>

<template>
  <div class="ginko-tab"><slot /></div>
</template>
