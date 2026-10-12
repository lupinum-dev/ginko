<script setup lang="ts">
const { t } = useI18n()
useSeoMeta({ title: () => `${t('lunchWeek')} | Gasthaus zur Linde` })
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ t('lunchWeek') }}</h1>
    <div class="body"><LunchWeek /></div>
  </div>
</template>

<style scoped>
.body { margin-top: 20px; max-width: 56rem; }
</style>
