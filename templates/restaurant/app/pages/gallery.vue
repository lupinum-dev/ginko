<script setup lang="ts">
// All photos of content/gallery.md in justified rows; each opens in the lightbox.
const gallery = useGinko('gallery')
const { t } = useI18n('home')
const images = computed(() => gallery.value.data.images.map((entry) => entry.image))
usePageSeo(() => ({ title: t('gallery'), description: t('galleryLead'), image: images.value[0] }))
</script>

<template>
  <div>
    <BlockPageHeader :title="t('gallery')" :lead="t('galleryLead')" />
    <div class="mx-auto max-w-page px-gutter">
      <BlockGallery v-if="images.length" :images="images" eager />
      <BlockEmpty v-else :title="t('galleryEmpty')" path="content/gallery.md" />
    </div>
  </div>
</template>
