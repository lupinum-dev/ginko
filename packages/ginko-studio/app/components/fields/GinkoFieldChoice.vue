<!-- ≤ 5 options as radio buttons (chips like the options of a choices field), more as a select (UI.md 5). -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import type { Field, Json } from '@lupinum/ginko'
import { Label } from '@studio/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@studio/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@studio/components/ui/select'
import { OPTION_CHIP, SELECT_CONTROL } from './sizes'
import { useStudioSite } from '../../utils/labels'

const props = defineProps<{ id: string; field: Extract<Field, { type: 'choice' }>; modelValue: Json | undefined; invalid: boolean; describedBy?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()
const { shown } = useStudioSite()
const { t } = useI18n()
const few = computed(() => props.field.options.length <= 5)
const current = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : undefined))
</script>

<template>
  <RadioGroup v-if="few" :id="id" class="flex flex-wrap gap-2" :model-value="current" :aria-labelledby="`${id}-label`" :aria-describedby="describedBy" :aria-invalid="invalid" @update:model-value="emit('update:modelValue', $event as string)">
    <Label v-for="o in field.options" :key="o.value" :for="`${id}-${o.value}`" :class="OPTION_CHIP">
      <RadioGroupItem :id="`${id}-${o.value}`" :value="o.value" />
      {{ shown(o.label) }}
    </Label>
  </RadioGroup>
  <Select v-else :model-value="current" @update:model-value="emit('update:modelValue', ($event as string) || undefined)">
    <SelectTrigger :id="id" :class="['w-full', SELECT_CONTROL]" :aria-invalid="invalid" :aria-describedby="describedBy">
      <SelectValue :placeholder="t('fields.choose')" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="o in field.options" :key="o.value" :value="o.value" class="min-h-9 pointer-coarse:min-h-11">{{ shown(o.label) }}</SelectItem>
    </SelectContent>
  </Select>
</template>
