<script setup lang="ts">
definePageMeta({ i18n: { paths: { en: '/products/:slug()' } } })
</script>

<template><PageProduct :slug="String($route.params.slug)" /></template>
