<!-- The field-by-field diff of one history row (UI.md 10.5), loaded when the row is opened. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Schema } from '@lupinum/ginko'
import { opErrorOf } from '../composables/useOps'

const props = defineProps<{ site: string; change: string; brick: string; schema: Schema }>()
const detail = useConvexQuery(api.changes.get, () => ({ site: props.site, change: props.change }))
const fields = computed(() => (Object.hasOwn(props.schema.bricks, props.brick) ? props.schema.bricks[props.brick]?.fields : undefined))
</script>

<template>
  <div class="w-full">
    <p v-if="detail.error.value" class="font-medium text-destructive" role="alert">{{ opErrorOf(detail.error.value).message }}</p>
    <ChangeDiff v-else-if="detail.data.value" :diff="detail.data.value.diff" :fields="fields" :locale="schema.locales[0]!" />
  </div>
</template>
