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

/** `status`: a warning about the day that is not an error (the field stays valid), shown under it. */
const props = defineProps<{ id: string; timeZone: string; error?: string; status?: string; label?: string; hint?: string; optional?: boolean }>()
const day = defineModel<string>({ required: true })
/**
 * A day typed by keyboard and not finished, or no date at all: the input's value is then empty, the same as no day, and
 * only its `validity` tells them apart. The form refuses a save while it is set, so a lost day never means "today".
 */
const bad = defineModel<boolean>('bad', { default: false })
const check = (event: Event) => { bad.value = (event.target as HTMLInputElement).validity?.badInput === true }
const errors = computed(() => (bad.value ? [t('dated.notADate')] : props.error ? [props.error] : []))
function pick(value: string) {
  bad.value = false
  day.value = value
}
const { t } = useI18n()
const today = useToday(computed(() => props.timeZone))
const tomorrow = computed(() => addDays(today.value, 1))
const max = computed(() => `${Number(today.value.slice(0, 4)) + 1}${today.value.slice(4)}`)
/** "Leeren", also for a date typed and not finished: the input's own typed parts go too, which the model cannot reach. */
function clear() {
  const input = document.getElementById(props.id) as HTMLInputElement | null
  if (input) input.value = ''
  pick('')
  nextTick(() => input?.focus())
}
</script>

<template>
  <div class="grid gap-1.5">
    <FieldFrame :id="id" :label="label ?? t('dated.startsOn')" :hint="hint ?? (optional ? t('dated.startsOnHint') : undefined)" :optional="optional" :errors="errors">
      <template #default="{ describedBy, invalid }">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-2">
          <Input :id="id" v-model="day" type="date" class="min-w-0 max-w-56 flex-1 basis-40" :min="tomorrow" :max="max" :aria-invalid="invalid" :aria-describedby="describedBy" @input="check" @change="check" @keyup="check" @blur="check" />
          <div class="flex min-w-0 flex-wrap gap-1.5">
            <Button type="button" variant="secondary" size="sm" class="px-2.5 aria-pressed:bg-accent aria-pressed:text-accent-foreground aria-pressed:ring-1 aria-pressed:ring-ring" :aria-pressed="day === tomorrow" @click="pick(tomorrow)">{{ t('fields.date.tomorrow') }}</Button>
            <Button v-if="optional && (day || bad)" type="button" variant="ghost" size="sm" @click="clear">{{ t('fields.clear') }}</Button>
          </div>
        </div>
      </template>
    </FieldFrame>
    <!-- Not an error: the day is valid, so the field is not marked invalid (H1). -->
    <p v-if="status" :id="`${id}-status`" class="text-sm font-medium text-warning" role="status">{{ status }}</p>
  </div>
</template>
