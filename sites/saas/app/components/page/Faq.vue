<script setup lang="ts">
const { labels } = useSite()
usePageSeo('faq')
</script>

<template>
  <div class="wrap page-body">
    <h1 class="page-title">{{ labels.pages.faq.title }}</h1>
    <div class="body"><FaqList /></div>
  </div>
</template>

<style scoped>
.body { margin-top: 32px; }
</style>
