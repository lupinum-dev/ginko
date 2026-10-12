<script setup lang="ts">
definePageMeta({ i18n: { paths: { de: '/ueber-uns' } } })
const { t } = useI18n()
</script>

<template>
  <div>
    <h1 data-test="title">
      {{ t('about.title') }}
    </h1>
    <p>{{ t('about.body') }}</p>
  </div>
</template>
