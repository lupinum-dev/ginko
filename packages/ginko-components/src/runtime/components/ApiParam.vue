<script setup lang="ts">
import { computed } from 'vue'
import { apiEntryId, groupLabel, signatureTail } from './api.utils'
import { isOn } from './interactive-utils'
import { useText } from './text'

// One parameter or field of ::api. The Markdown content is the description. <Api> groups the rows by `group`.
// A bare `required` shows the badge; absent or `:required="false"` shows nothing.
const props = defineProps<{
  name: string; group?: string; type?: string; required?: boolean | string; deprecated?: boolean | string; since?: string; defaultValue?: string
}>()
const t = useText()
const deprecated = computed(() => isOn(props.deprecated))
const required = computed(() => isOn(props.required))
const tail = computed(() => signatureTail({ type: props.type, defaultValue: props.defaultValue }))
const id = computed(() => apiEntryId(groupLabel(props.group, t('api.defaultGroup')), props.name))
</script>

<template>
  <div :id="id" class="ginko-api-param">
    <code class="ginko-api-signature"><span class="ginko-api-name" :data-deprecated="deprecated || undefined">{{ name }}</span><span v-if="tail" class="ginko-api-type">{{ tail }}</span></code>
    <span v-if="required || deprecated || since" class="ginko-api-badges">
      <span v-if="required" class="ginko-api-badge" data-state="required">{{ t('api.required') }}</span>
      <span v-if="deprecated" class="ginko-api-badge" data-state="deprecated">{{ t('api.deprecated') }}</span>
      <span v-if="since" class="ginko-api-badge" data-state="since">{{ t('api.since', { version: since }) }}</span>
    </span>
    <div v-if="$slots.default" class="ginko-api-description"><slot /></div>
  </div>
</template>
