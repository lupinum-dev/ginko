<script setup lang="ts">
// Shown by the pages feature at the top of a page of content/pages/ (below its title): on the sponsoring page the
// contact details of content/site.md, which its text points to. Other pages get nothing.
defineProps<{ id: string }>()
</script>

<template>
  <div v-if="id === 'pages/sponsoring'" class="mx-auto max-w-page px-gutter">
    <SiteContact class="mb-10" />
  </div>
</template>
