<!-- Several options on/off as checkboxes. A required field also offers "Keine" (stores []), so "none"
     is a deliberate answer; a new entry starts unset (UI.md 5). `max` stops further choices. -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import type { Field, Json } from '@lupinum/ginko'
import { Checkbox } from '@studio/components/ui/checkbox'
import { Label } from '@studio/components/ui/label'
import { useStudioSite } from '../../utils/labels'

const props = defineProps<{ id: string; field: Extract<Field, { type: 'choices' }>; modelValue: Json | undefined; invalid: boolean; describedBy?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()
const { shown } = useStudioSite()
const { t } = useI18n()
const values = computed(() => (Array.isArray(props.modelValue) ? (props.modelValue as string[]) : undefined))
const none = computed(() => values.value !== undefined && values.value.length === 0)
const atMax = computed(() => props.field.max !== undefined && (values.value?.length ?? 0) >= props.field.max)

function toggle(value: string, on: boolean) {
  const current = values.value ?? []
  const next = on ? [...current, value] : current.filter((v) => v !== value)
  // Unchecking the last option of a required field leaves it unset: only a tap on "Keine" answers "none".
  if (next.length === 0 && !props.field.optional) return emit('update:modelValue', undefined)
  const order = props.field.options.map((o) => o.value)
  emit('update:modelValue', next.sort((a, b) => order.indexOf(a) - order.indexOf(b)))
}
const row = 'min-h-10 cursor-pointer gap-2 rounded-md border border-input px-3 py-2 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/80 pointer-coarse:min-h-11'
</script>

<template>
  <div class="flex flex-wrap gap-2" role="group" tabindex="-1" :aria-labelledby="`${id}-label`" :aria-describedby="describedBy" :aria-invalid="invalid">
    <Label v-for="o in field.options" :key="o.value" :for="`${id}-${o.value}`" :class="row">
      <Checkbox :id="`${id}-${o.value}`" :model-value="values?.includes(o.value) ?? false" :disabled="atMax && !values?.includes(o.value)" @update:model-value="toggle(o.value, $event === true)" />
      {{ shown(o.label) }}
    </Label>
    <Label v-if="!field.optional" :for="`${id}-none`" :class="[row, 'border-dashed']">
      <Checkbox :id="`${id}-none`" :model-value="none" @update:model-value="$event === true ? emit('update:modelValue', []) : emit('update:modelValue', undefined)" />
      {{ t('fields.none') }}
    </Label>
  </div>
  <p v-if="!field.optional && values === undefined" class="text-sm text-warning">{{ t('fields.notSet') }}</p>
</template>
