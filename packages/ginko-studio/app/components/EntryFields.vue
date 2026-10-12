<!-- A run of fields of one entry form. Fields whose `showWhen` does not match stay mounted and hidden (their input stays). -->
<script setup lang="ts">
import { isShown, type Field, type Json, type Locale } from '@lupinum/ginko'
import type { Issue } from '@lupinum/ginko-editor'
import GinkoField from './fields/GinkoField.vue'

defineProps<{
  entries: [string, Field][]
  draft: Record<string, Json | undefined>
  baseline: Record<string, Json | undefined>
  locale: Locale
  locales: readonly Locale[]
  issues: Issue[]
  route?: Partial<Record<Locale, string>>
  /** Date fields that take a week start: they get "This week" and "Next week" (a planned week's start). */
  weeks?: readonly string[]
}>()
const emit = defineEmits<{ update: [key: string, value: Json | undefined] }>()
</script>

<template>
  <GinkoField
    v-for="[key, field] in entries" v-show="isShown(field, draft)" :key="key" :field="field" :model-value="draft[key]" :baseline="baseline[key]" :path="key"
    :locale="locale" :locales="locales" :issues="issues" :route="route" :weeks="weeks?.includes(key)" @update:model-value="emit('update', key, $event)"
  />
</template>
