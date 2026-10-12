<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Field, Json } from '@lupinum/ginko'
import { Input } from '@studio/components/ui/input'

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
  <div class="flex max-w-56 items-center gap-2">
    <Input :id="id" inputmode="decimal" :model-value="text" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="input(String($event))" />
    <span v-if="field.unit" class="text-sm text-muted-foreground">{{ field.unit }}</span>
  </div>
</template>
