<script setup lang="ts">
const start = useGinko('start')
// The page title and description come from `name` and `seo` in ginko.config.ts. Pass `{ title }` to name a page.
useGinkoSeo({})
</script>

<template>
  <main>
    <h1>{{ start.data.title }}</h1>
    <GinkoMarkdown :value="start.data.body" />
  </main>
</template>
