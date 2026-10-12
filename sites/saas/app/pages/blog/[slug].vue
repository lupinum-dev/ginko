<script setup lang="ts">
definePageMeta({ i18n: { paths: { en: '/blog/:slug()', fr: '/blog/:slug()' } } })
</script>

<template><PagePost :slug="String($route.params.slug)" /></template>
