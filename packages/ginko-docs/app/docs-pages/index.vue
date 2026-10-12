<script setup lang="ts">
// The start page: the site's `home` brick (docsHome) when it has one, otherwise the first docs page.
import schema from '#ginko/schema'

const hasHome = Object.hasOwn(schema.bricks, 'home')
if (!hasHome) await navigateTo(useDocs().first.value ?? '/', { redirectCode: 302 })
</script>

<template>
  <DocsLanding v-if="hasHome" />
</template>
