<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Field, Json } from '@lupinum/ginko'
import { Input } from '@studio/components/ui/input'
import { focusUnitInput, UNIT_BOX, UNIT_INPUT, UNIT_TEXT } from './sizes'

const props = defineProps<{ id: string; field: Extract<Field, { type: 'number' }>; modelValue: Json | undefined; invalid: boolean; describedBy?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()
const text = ref(typeof props.modelValue === 'number' ? String(props.modelValue).replace('.', ',') : '')
watch(() => props.modelValue, (v) => {
  const parsed = Number(text.value.replace(',', '.'))
  if (v !== parsed) text.value = typeof v === 'number' ? String(v).replace('.', ',') : ''
})
function input(raw: string) {
  text.value = raw
  const n = Number(raw.trim().replace(',', '.'))
  emit('update:modelValue', raw.trim() === '' || Number.isNaN(n) ? undefined : n)
}
</script>

<template>
  <!-- A click on the unit puts the cursor in the number (a mouse convenience; the keyboard reaches the input itself). -->
  <div v-if="field.unit" :class="UNIT_BOX" @click="focusUnitInput">
    <Input :id="id" inputmode="decimal" :class="UNIT_INPUT" :model-value="text" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="input(String($event))" />
    <span :class="UNIT_TEXT">{{ field.unit }}</span>
  </div>
  <Input v-else :id="id" inputmode="decimal" :model-value="text" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="input(String($event))" />
</template>
