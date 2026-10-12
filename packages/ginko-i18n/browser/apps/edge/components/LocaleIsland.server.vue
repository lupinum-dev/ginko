<script setup lang="ts">
// `locale` is read by ginko-i18n from the island props; declared so Vue does not warn about it.
defineProps<{ locale?: string }>()
// eslint-disable-next-line vue/no-dupe-keys -- the island prop selects the locale; the template deliberately reads the resolved locale
const { t, locale } = useI18n()
</script>

<template>
  <p data-test="island">
    {{ t('home.title') }} ({{ locale }})
  </p>
</template>
