<!-- The one frame around every field: label ("(optional)" in muted text), hint under the label, the
     control, the errors (destructive colour, role="alert"). The control gets `describedBy` and
     `invalid` from the slot, so the wiring of ids lives here and nowhere else. A `source` slot puts
     the main-language text next to the control (above it on phones). `inline` is for switches:
     control first, label beside it. `group` is for fields without one input (the label is then
     referenced with aria-labelledby, not `for`). Every field has its label above the control and its hint under it
     (design A, 2026-10-20: one label style in every form). -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import { CircleAlertIcon } from '@lucide/vue'
import { Label } from '@studio/components/ui/label'

const { t } = useI18n()

const props = defineProps<{
  id: string
  label: string
  hint?: string
  optional?: boolean
  errors?: readonly string[]
  group?: boolean
  inline?: boolean
  /** A short value (number, money, time): the box is as wide as one date of a date range, not the whole form. */
  short?: boolean
  /** e.g. "34/40", shown at the end under the control. */
  count?: string
  /** The label is read by screen readers only: a row of a compact list, whose column the list names once. */
  labelHidden?: boolean
}>()
defineSlots<{
  default(props: { describedBy: string | undefined; invalid: boolean }): unknown
  source?(): unknown
}>()

const invalid = computed(() => (props.errors?.length ?? 0) > 0)
const describedBy = computed(() => [props.hint ? `${props.id}-hint` : '', invalid.value ? `${props.id}-err` : ''].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <div class="grid gap-1.5" data-slot="field">
    <div v-if="inline" class="flex items-start gap-3">
      <div class="flex min-h-10 items-center pointer-coarse:min-h-11"><slot :described-by="describedBy" :invalid="invalid" /></div>
      <div class="grid gap-1">
        <Label :id="`${id}-label`" :for="id" class="min-h-10 text-sm leading-snug font-medium pointer-coarse:min-h-11">
          <span>{{ label }}<span v-if="optional" class="font-normal text-muted-foreground">{{ ' ' + t('fields.optional') }}</span></span>
        </Label>
        <p v-if="hint" :id="`${id}-hint`" class="text-sm text-muted-foreground">{{ hint }}</p>
      </div>
    </div>
    <template v-else>
      <component :is="group ? 'p' : Label" :id="`${id}-label`" :for="group ? undefined : id" :class="['text-sm leading-snug font-medium', labelHidden && 'sr-only']">
        <span>{{ label }}<span v-if="optional" class="font-normal text-muted-foreground">{{ ' ' + t('fields.optional') }}</span></span>
      </component>
      <div v-if="$slots.source" class="grid gap-3 lg:grid-cols-2 lg:items-start">
        <slot name="source" />
        <div :class="['grid gap-2', short && 'max-w-[13.5rem]']"><slot :described-by="describedBy" :invalid="invalid" /></div>
      </div>
      <div v-else-if="short" class="grid max-w-[13.5rem]"><slot :described-by="describedBy" :invalid="invalid" /></div>
      <slot v-else :described-by="describedBy" :invalid="invalid" />
      <div v-if="hint || count" class="flex gap-3 text-sm text-muted-foreground">
        <p v-if="hint" :id="`${id}-hint`" class="min-w-0 flex-1">{{ hint }}</p>
        <p v-if="count" class="ml-auto" aria-live="polite">{{ count }}</p>
      </div>
    </template>
    <div v-if="invalid" :id="`${id}-err`" role="alert" class="grid gap-1">
      <p v-for="e in errors" :key="e" class="flex items-start gap-1.5 text-sm font-medium text-destructive">
        <CircleAlertIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ e }}
      </p>
    </div>
  </div>
</template>
