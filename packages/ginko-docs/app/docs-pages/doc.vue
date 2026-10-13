<script setup lang="ts">
const route = useRoute()
const doc = useGinkoEntry('docs', () => route.params.slug)
const toc = computed(() => doc.value.data.body.toc?.links ?? [])
</script>

<template>
  <DocsShell>
    <template v-if="toc.length" #bar>
      <DocsToc :links="toc" variant="menu" />
    </template>
    <DocsPage :doc="doc" />
  </DocsShell>
</template>
