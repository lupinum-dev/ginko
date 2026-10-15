<script setup lang="ts">
// Shown by the pages feature at the top of a page of content/pages/ (below its title): the next date on the Get
// involved page, so the main way to help has its date right there. Other pages get nothing.
defineProps<{ id: string }>()
</script>

<template>
  <div v-if="id === 'pages/get-involved'" class="mx-auto max-w-page px-gutter">
    <EventNext class="mb-10 max-w-3xl rounded-block border p-6" />
  </div>
</template>
