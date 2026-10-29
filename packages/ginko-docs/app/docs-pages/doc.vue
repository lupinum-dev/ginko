<script setup lang="ts">
const route = useRoute()
const doc = useGinkoEntry(useDocsBrick(), () => route.params.slug)
// The toc comes with the text (page state holds only its ref); the same request as the page's <GinkoMarkdown>.
const tree = await useGinkoMarkdown(() => doc.value.data.body)
const toc = computed(() => tree.value?.toc?.links ?? [])
</script>

<template>
  <DocsShell>
    <template v-if="toc.length" #bar>
      <DocsToc :links="toc" variant="menu" />
    </template>
    <DocsPage :doc="doc" />
  </DocsShell>
</template>
