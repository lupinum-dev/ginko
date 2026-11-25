<!-- "Gilt ab": the day a save of an online entry starts on (D125, D131). Empty is today: the save goes online at once.
     A day goes into a dated change; the earliest is tomorrow in the site's zone, the latest the same date next year
     (the server checks both). Used under the fields of a task with `when.from: 'ask'` and in the publish panel of an
     online entry's unpublished changes. -->
<script setup lang="ts">
import { addDays } from '@lupinum/ginko/internal'
import { useToday } from '@lupinum/ginko-editor'
import { Button } from '@studio/components/ui/button'
import { Input } from '@studio/components/ui/input'
import FieldFrame from './fields/FieldFrame.vue'

const props = defineProps<{ id: string; timeZone: string; error?: string; label?: string; hint?: string; optional?: boolean }>()
const day = defineModel<string>({ required: true })
const { t } = useI18n()
const today = useToday(computed(() => props.timeZone))
const tomorrow = computed(() => addDays(today.value, 1))
const max = computed(() => `${Number(today.value.slice(0, 4)) + 1}${today.value.slice(4)}`)
function clear() {
  day.value = ''
  nextTick(() => document.getElementById(props.id)?.focus())
}
</script>

<template>
  <FieldFrame :id="id" :label="label ?? t('dated.startsOn')" :hint="hint ?? (optional ? t('dated.startsOnHint') : undefined)" :optional="optional" :errors="error ? [error] : []">
    <template #default="{ describedBy, invalid }">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-2">
        <Input :id="id" v-model="day" type="date" class="min-w-0 max-w-56 flex-1 basis-40" :min="tomorrow" :max="max" :aria-invalid="invalid" :aria-describedby="describedBy" />
        <div class="flex min-w-0 flex-wrap gap-1.5">
          <Button type="button" variant="secondary" size="sm" class="px-2.5 aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:ring-1 aria-pressed:ring-ring" :aria-pressed="day === tomorrow" @click="day = tomorrow">{{ t('fields.date.tomorrow') }}</Button>
          <Button v-if="optional && day" type="button" variant="ghost" size="sm" @click="clear">{{ t('fields.clear') }}</Button>
        </div>
      </div>
    </template>
  </FieldFrame>
</template>
