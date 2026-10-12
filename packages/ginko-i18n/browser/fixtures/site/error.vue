<script setup lang="ts">
const props = defineProps<{ error: { statusCode: number } }>()
const { t, localePath } = useI18n()
</script>

<template>
  <div>
    <h1 data-test="error-title">
      {{ props.error.statusCode }} · {{ t('error.title') }}
    </h1>
    <NuxtLink
      data-test="error-back"
      :to="localePath('/')"
    >{{ t('error.back') }}</NuxtLink>
  </div>
</template>
