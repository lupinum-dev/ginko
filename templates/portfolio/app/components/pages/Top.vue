<script setup lang="ts">
// Shown by the pages feature at the top of a page of content/pages/ (below its title): on "How we work" the way to
// start a project (the email with its subject, the phone and the address of content/site.md), so a visitor who has
// read how a project runs can begin right there. Other pages get nothing.
defineProps<{ id: string }>()
</script>

<template>
  <div v-if="id === 'pages/how-we-work'" class="mx-auto max-w-page px-gutter pb-10">
    <StartProject />
  </div>
</template>
