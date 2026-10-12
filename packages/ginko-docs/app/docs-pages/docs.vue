<script setup lang="ts">
// The docs address itself (`/docs`) has no page of its own: it leads to the first docs page of the language.
await navigateTo(useDocs().first.value ?? '/', { redirectCode: 302 })
</script>

<template>
  <div />
</template>
