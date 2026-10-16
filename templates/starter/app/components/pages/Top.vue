<script setup lang="ts">
// Shown by the pages feature at the top of a page of content/pages/ (below its title): the contact details of
// content/site.md on the Contact page, so the address is written once. Other pages get nothing.
defineProps<{ id: string }>()
</script>

<template>
  <div v-if="id === 'pages/contact'" class="mx-auto max-w-page px-gutter pb-10">
    <SiteContact />
  </div>
</template>
