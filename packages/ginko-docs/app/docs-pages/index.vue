<script setup lang="ts">
import { toFirstDoc } from '../lib/docsFirst'
// The start page: the site's `home` brick (docsHome) when it has one, otherwise the first docs page.
import schema from '#ginko/schema'

const hasHome = Object.hasOwn(schema.bricks, 'home')
if (!hasHome) await toFirstDoc()
</script>

<template>
  <DocsLanding v-if="hasHome" />
</template>
