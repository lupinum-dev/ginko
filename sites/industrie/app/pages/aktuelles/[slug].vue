<script setup lang="ts">
definePageMeta({ i18n: { paths: { en: '/news/:slug()' } } })
</script>

<template><PageNewsEntry :slug="String($route.params.slug)" /></template>
