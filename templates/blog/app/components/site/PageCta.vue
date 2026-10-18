<script setup lang="ts">
// The end of a post (the shared post page shows this file when the template has it): where a reader wants more, the
// feed and the newsletter. It reuses SiteFooterStatus, so there is no form and no data goes to a newsletter service.
const id = useId()
const { t } = useI18n()
const { name } = useGinkoSite()
</script>

<template>
  <section :aria-labelledby="id" class="mx-auto max-w-page px-gutter pt-section print:hidden">
    <h2 :id="id" class="text-h3">{{ t('follow', { name }) }}</h2>
    <SiteFooterStatus class="mt-2" />
  </section>
</template>
