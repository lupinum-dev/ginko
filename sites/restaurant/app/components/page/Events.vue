<script setup lang="ts">
const { t } = useI18n()
useSeoMeta({ title: () => `${t('events')} | Gasthaus zur Linde` })
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ t('events') }}</h1>
    <div class="body"><EventList /></div>
  </div>
</template>

<style scoped>
.body { margin-top: 28px; max-width: 56rem; }
</style>
