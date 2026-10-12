<script setup lang="ts">
definePageMeta({ i18n: { locales: ['de'] } })
const { t } = useI18n()
</script>

<template>
  <h1 data-test="title">
    {{ t('onlyDe.title') }}
  </h1>
</template>
