<script setup lang="ts">
const { t } = useI18n()

const { head } = useSite()
head(() => t('events'), 'events')
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ t('events') }}</h1>
    <div class="page-body"><EventList /></div>
  </div>
</template>
