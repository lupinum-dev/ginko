<!-- A calendar date with "Heute"/"Morgen" in the site's time zone (UI.md 5). The browser's own date
     picker is the control: on a phone it is the system wheel, on a laptop a calendar popup. -->
<script setup lang="ts">
import { computed, inject, nextTick, ref, type Ref } from 'vue'
import { useI18n } from '#imports'
import type { Json } from '@lupinum/ginko'
import { addDays, isDate, startOfWeek, weekInfo, workWeekOf, type SiteWeek } from '@lupinum/ginko/internal'
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
// The site's week (layouts/site.vue). Without it (no site loaded) a week field offers no shortcuts and keeps the date.
const siteWeek = inject<Ref<SiteWeek | undefined>>('ginko:week', ref(undefined))
const week = computed(() => siteWeek.value && weekInfo(siteWeek.value))
const today = useToday(timeZone)
const { t } = useI18n()
const value = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''))
const WEEK_LABELS = { 0: 'fields.date.thisWeek', 1: 'fields.date.nextWeek', 2: 'fields.date.weekAfterNext' } as const
const quick = computed(() => {
  const info = week.value
  if (!props.weeks) return [{ label: t('fields.date.today'), date: today.value }, { label: t('fields.date.tomorrow'), date: addDays(today.value, 1) }]
  return info ? props.weeks.map((offset) => ({ label: t(WEEK_LABELS[offset]), date: addDays(workWeekOf(today.value, info), 7 * offset) })) : []
})
/** "Leeren" hides itself once the field is empty: the focus goes to the date, not to <body>. */
function clear() {
  emit('update:modelValue', undefined)
  nextTick(() => document.getElementById(props.id)?.focus())
}

/**
 * A week field takes the first day of the week of a date typed or picked (a week stored as a Thursday never shows).
 * On leaving the field, not on each input: while someone types the day, the date must not jump under the cursor.
 */
function toWeekStart() {
  const info = week.value
  if (props.weeks && info && isDate(value.value) && startOfWeek(value.value, info) !== value.value) emit('update:modelValue', startOfWeek(value.value, info))
}
</script>

<template>
  <!-- The shortcuts stay on the line of the date while it fits; in a narrow column they wrap under it. -->
  <div class="flex flex-wrap items-center gap-x-2 gap-y-2">
    <Input :id="id" type="date" class="min-w-0 flex-1 basis-40" :model-value="value" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="emit('update:modelValue', String($event) || undefined)" @blur="toWeekStart" />
    <div class="flex min-w-0 flex-wrap gap-1.5">
      <Button v-for="q in quick" :key="q.label" type="button" variant="secondary" size="sm" class="px-2.5 aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:ring-1 aria-pressed:ring-ring" :aria-pressed="value === q.date" @click="emit('update:modelValue', q.date)">{{ q.label }}</Button>
      <Button v-if="optional && value" type="button" variant="ghost" size="sm" @click="clear">{{ t('fields.clear') }}</Button>
    </div>
  </div>
</template>
