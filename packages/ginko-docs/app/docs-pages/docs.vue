<script setup lang="ts">
import { toFirstDoc } from '../lib/docsFirst'
// The docs address itself (`/docs`) has no page of its own: it leads to the first docs page of the language.
await toFirstDoc()
</script>

<template>
  <div />
</template>
