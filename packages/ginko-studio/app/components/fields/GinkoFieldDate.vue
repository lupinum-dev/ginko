<!-- A calendar date with "Heute"/"Morgen" in the site's time zone (UI.md 5). The browser's own date
     picker is the control: on a phone it is the system wheel, on a laptop a calendar popup. -->
<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import { useI18n } from '#imports'
import { addDays, DEFAULT_WEEK, workWeekOf, type Json, type WeekInfo } from '@lupinum/ginko'
import { useToday } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'

const props = defineProps<{ id: string; modelValue: Json | undefined; invalid: boolean; describedBy?: string; optional?: boolean; weeks?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: Json | undefined] }>()
const timezone = inject<Ref<string>>('ginko:timezone', ref('Europe/Vienna'))
const week = inject<Ref<WeekInfo>>('ginko:week', ref(DEFAULT_WEEK))
const today = useToday(timezone)
const { t } = useI18n()
const value = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : ''))
/** A week start (preset @thisWeek) offers week starts of this site's week; any other date offers today and tomorrow. */
const quick = computed(() => props.weeks
  ? [{ label: t('fields.date.thisWeek'), date: workWeekOf(today.value, week.value) }, { label: t('fields.date.nextWeek'), date: addDays(workWeekOf(today.value, week.value), 7) }]
  : [{ label: t('fields.date.today'), date: today.value }, { label: t('fields.date.tomorrow'), date: addDays(today.value, 1) }])
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <Input :id="id" type="date" class="w-full sm:w-48" :model-value="value" :aria-invalid="invalid" :aria-describedby="describedBy" @update:model-value="emit('update:modelValue', String($event) || undefined)" />
    <div class="flex gap-2">
      <Button v-for="q in quick" :key="q.label" type="button" variant="outline" class="aria-pressed:border-primary aria-pressed:bg-accent" :aria-pressed="value === q.date" @click="emit('update:modelValue', q.date)">{{ q.label }}</Button>
      <Button v-if="optional && value" type="button" variant="ghost" @click="emit('update:modelValue', undefined)">{{ t('fields.clear') }}</Button>
    </div>
  </div>
</template>
