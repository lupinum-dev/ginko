<script setup lang="ts">
// Replaces the empty override point of @lupinum/ginko-docs: under the text of every help page, the support contact.
defineProps<{ doc: { id: string } }>()
</script>

<template>
  <HelpContact class="mt-12" />
</template>
