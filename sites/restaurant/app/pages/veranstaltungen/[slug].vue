<script setup lang="ts">
definePageMeta({ i18n: { paths: { en: '/events/:slug()' } } })
</script>

<template><PageEvent :slug="String($route.params.slug)" /></template>
