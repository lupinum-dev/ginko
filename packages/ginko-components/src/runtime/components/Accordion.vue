<script setup lang="ts">
import { computed, provide, useId } from 'vue'
import { ACCORDION_KEY, isOn } from './interactive-utils'

// Opening one entry closes the others (the shared `name` of <details>, done by the browser); `multiple` turns that off.
const props = defineProps<{ multiple?: boolean | string }>()
const id = useId()
provide(ACCORDION_KEY, computed(() => (isOn(props.multiple) ? undefined : id)))
</script>

<template>
  <div class="ginko-accordion"><slot /></div>
</template>
