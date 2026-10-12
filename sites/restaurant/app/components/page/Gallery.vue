<script setup lang="ts">
const { t } = useI18n()
const gallery = useGinko('gallery')
useSeoMeta({ title: () => `${t('gallery')} | Gasthaus zur Linde` })
</script>

<template>
  <div class="wrap">
    <h1 class="page-title">{{ t('gallery') }}</h1>
    <div class="body">
      <PhotoGrid v-if="gallery.data.images.length" :images="gallery.data.images" :fallback="gallery.fallback" />
      <p v-else class="lede">{{ t('noImages') }}</p>
    </div>
  </div>
</template>

<style scoped>
.body { margin-top: 28px; }
</style>
