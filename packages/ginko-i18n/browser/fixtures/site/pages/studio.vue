<script setup lang="ts">
definePageMeta({ i18n: false })
const { t, locale } = useI18n()
</script>

<template>
  <h1 data-test="title">
    {{ t('nav.studio') }} ({{ locale }})
  </h1>
</template>
