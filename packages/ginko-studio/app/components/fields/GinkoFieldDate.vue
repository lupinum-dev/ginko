<!-- A calendar date with "Heute"/"Morgen" in the site's time zone (UI.md 5). The browser's own date
     picker is the control: on a phone it is the system wheel, on a laptop a calendar popup. -->
<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import { useI18n } from '#imports'
import type { Json, WeekInfo } from '@lupinum/ginko'
import { addDays, DEFAULT_WEEK, isDate, startOfWeek, workWeekOf } from '@lupinum/ginko/internal'
import { useToday } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import type { WeekOffset } from '../../utils/content'

const props = defineProps<{
  id: string; modelValue: Json | undefined; invalid: boolean; describedBy?: string; optional?: boolean
  /** The date is the first day of a week (`weekShortcuts`): week shortcuts, as weeks after this work week, instead of Heute/Morgen. */
  weeks?: readonly WeekOffset[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()
const timeZone = inject<Ref<string>>('ginko:timeZone', ref('Europe/Vienna'))
const week = inject<Ref<WeekInfo>>('ginko:week', ref(DEFAULT_WEEK))
const today = useToday(timeZone)
const { t } = useI18n()
const value = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''))
const WEEK_LABELS = { 0: 'fields.date.thisWeek', 1: 'fields.date.nextWeek', 2: 'fields.date.weekAfterNext' } as const
const quick = computed(() => props.weeks
  ? props.weeks.map((offset) => ({ label: t(WEEK_LABELS[offset]), date: addDays(workWeekOf(today.value, week.value), 7 * offset) }))
  : [{ label: t('fields.date.today'), date: today.value }, { label: t('fields.date.tomorrow'), date: addDays(today.value, 1) }])

/**
 * A week field takes the first day of the week of a date typed or picked (a week stored as a Thursday never shows).
 * On leaving the field, not on each input: while someone types the day, the date must not jump under the cursor.
 */
function toWeekStart() {
  if (props.weeks && isDate(value.value) && startOfWeek(value.value, week.value) !== value.value) emit('update:modelValue', startOfWeek(value.value, week.value))
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <Input :id="id" type="date" class="w-full sm:w-48" :model-value="value" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="emit('update:modelValue', String($event) || undefined)" @blur="toWeekStart" />
    <div class="flex gap-2">
      <Button v-for="q in quick" :key="q.label" type="button" variant="outline" class="aria-pressed:border-primary aria-pressed:bg-accent" :aria-pressed="value === q.date" @click="emit('update:modelValue', q.date)">{{ q.label }}</Button>
      <Button v-if="optional && value" type="button" variant="ghost" @click="emit('update:modelValue', undefined)">{{ t('fields.clear') }}</Button>
    </div>
  </div>
</template>
