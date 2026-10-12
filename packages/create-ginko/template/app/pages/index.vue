<script setup lang="ts">
const start = useGinko('start')
</script>

<template>
  <main>
    <h1>{{ start.data.title }}</h1>
    <GinkoMarkdown :value="start.data.body" />
  </main>
</template>
