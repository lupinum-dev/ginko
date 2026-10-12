<script setup lang="ts">
const { t } = useI18n()

const { head } = useSite()
head(() => t('news'), 'news')
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ t('news') }}</h1>
    <div class="page-body"><NewsList thumbs /></div>
  </div>
</template>
