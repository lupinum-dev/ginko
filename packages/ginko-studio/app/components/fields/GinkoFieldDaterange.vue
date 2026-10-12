<!-- From/to dates; moving "von" past "bis" pulls "bis" along (UI.md 5). -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import type { Json } from '@lupinum/ginko'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import { CONTAINED_FIELD } from './sizes'

const props = defineProps<{ id: string; modelValue: Json | undefined; invalid: boolean; describedBy?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()
const { t } = useI18n()
const range = computed(() => (props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue) ? (props.modelValue as { from?: string; to?: string }) : {}))

function set(part: 'from' | 'to', v: string) {
  const next = { from: range.value.from ?? '', to: range.value.to ?? '', [part]: v }
  if (part === 'from' && v && (!next.to || next.to < v)) next.to = v
  emit('update:modelValue', next.from || next.to ? next : undefined)
}
</script>

<template>
  <div class="grid max-w-md grid-cols-2 gap-3" role="group" :aria-labelledby="`${id}-label`" :aria-describedby="describedBy">
    <div :class="CONTAINED_FIELD">
      <Label :for="`${id}-from`" class="text-xs leading-snug font-medium text-muted-foreground">{{ t('fields.daterange.from') }}</Label>
      <Input :id="`${id}-from`" type="date" :model-value="range.from ?? ''" :aria-invalid="invalid" @update:model-value="set('from', String($event))" />
    </div>
    <div :class="CONTAINED_FIELD">
      <Label :for="`${id}-to`" class="text-xs leading-snug font-medium text-muted-foreground">{{ t('fields.daterange.to') }}</Label>
      <Input :id="`${id}-to`" type="date" :model-value="range.to ?? ''" :min="range.from" :aria-invalid="invalid" @update:model-value="set('to', String($event))" />
    </div>
  </div>
</template>
