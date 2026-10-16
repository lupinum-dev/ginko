<script setup lang="ts">
// Shown by the pages feature at the top of a page of content/pages/ (below its title): on the Get involved page the
// next date, so the main way to help has its date right there, and the contact details of content/site.md, which the
// text of the page points to. Other pages get nothing.
defineProps<{ id: string }>()
</script>

<template>
  <div v-if="id === 'pages/get-involved'" class="mx-auto max-w-page px-gutter">
    <EventNext class="mb-6 max-w-3xl rounded-block border p-6" />
    <SiteContact class="mb-10" />
  </div>
</template>
