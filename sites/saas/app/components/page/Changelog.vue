<script setup lang="ts">
const { labels } = useSite()
usePageSeo('changelog')
</script>

<template>
  <div class="wrap page-body">
    <h1 class="page-title">{{ labels.pages.changelog.title }}</h1>
    <div class="body"><ChangelogList level="h2" /></div>
  </div>
</template>

<style scoped>
.body { margin-top: 32px; max-width: 880px; }
</style>
