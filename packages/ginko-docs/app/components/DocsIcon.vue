<script setup lang="ts">
// One icon from the build-time map (modules/icons.ts). A bare name is a Lucide icon; an unknown name renders nothing.
import { computed } from 'vue'
import icons from '#docs-icons'

const props = defineProps<{ name: string }>()
const icon = computed(() => icons[props.name.includes(':') ? props.name : `lucide:${props.name}`])
</script>

<template>
  <svg v-if="icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" :viewBox="icon[1]" aria-hidden="true" v-html="icon[0]" />
</template>
