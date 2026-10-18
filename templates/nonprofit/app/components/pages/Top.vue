<script setup lang="ts">
// Shown by the pages feature at the top of a page of content/pages/ (below its title): on the Get involved page the
// next date, so the main way to help has its date right there, the dates after it, and the contact details of
// content/site.md, which the text of the page points to. Other pages get nothing.
defineProps<{ id: string }>()
const { t } = useI18n()
</script>

<template>
  <div v-if="id === 'pages/get-involved'" class="pb-10">
    <div class="mx-auto max-w-page px-gutter">
      <EventNext class="max-w-3xl rounded-block border p-6" />
    </div>
    <EventUpcoming :skip="1" :title="t('event.later')" />
    <div class="mx-auto max-w-page px-gutter pt-10">
      <SiteContact />
    </div>
  </div>
</template>
