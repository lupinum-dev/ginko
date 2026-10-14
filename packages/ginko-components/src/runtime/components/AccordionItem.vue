<script setup lang="ts">
import { computed, inject } from 'vue'
import { ACCORDION_KEY, isOn } from './interactive-utils'

// <details>/<summary>: works without JavaScript. `open` is the initial state; the reader's clicks are the browser's.
const props = defineProps<{ title?: string; open?: boolean | string }>()
const isOpen = computed(() => isOn(props.open))
const group = inject(ACCORDION_KEY, null)
const name = computed(() => group?.value)
</script>

<template>
  <details class="ginko-accordion-item" :name="name" :open="isOpen || undefined">
    <summary class="ginko-disclosure-summary">{{ title }}</summary>
    <div class="ginko-disclosure-body"><slot /></div>
  </details>
</template>
