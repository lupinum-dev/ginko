<script setup lang="ts">
// Markdown tables scroll sideways on a phone. The wrapper is the scroll box: keyboard users can focus it and scroll with the arrow keys.
// role=group, not region: a page can hold several tables, and landmarks with the same name are an error.
const { t } = useI18n()
</script>

<template>
  <div class="docs-table" role="group" tabindex="0" :aria-label="t('docs.table')">
    <table><slot /></table>
  </div>
</template>
