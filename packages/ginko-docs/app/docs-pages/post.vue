<script setup lang="ts">
const blog = useDocsBlog()
const post = blog.post(String(useRoute().params.slug))
</script>

<template>
  <DocsPost :post="post" />
</template>
