<!-- "Veröffentlichen …" of a draft (SPEC 15): now or at a time in the site's zone. The editor owns the state and the
     calls; this is the panel, in the phone save bar or in the desktop status card. -->
<script setup lang="ts">
import { Button } from '@studio/components/ui/button'
import { Label } from '@studio/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@studio/components/ui/radio-group'
import ScheduleField from './ScheduleField.vue'

defineProps<{ question: string; timeZone: string; scheduled: boolean; busy: boolean; error: string }>()
const when = defineModel<'now' | 'later'>('when', { required: true })
const at = defineModel<string>('at', { required: true })
const picked = defineModel<number | undefined>('picked')
const emit = defineEmits<{ publish: []; clearSchedule: []; cancel: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="grid basis-full gap-2.5 rounded-lg border border-primary bg-card p-3.5" role="group" aria-labelledby="publish-title">
    <p id="publish-title" class="font-semibold">{{ question }}</p>
    <RadioGroup v-model="when" class="flex flex-wrap gap-2" aria-labelledby="publish-title">
      <Label for="publish-now" class="min-h-10 cursor-pointer gap-2 rounded-md border px-3 py-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent pointer-coarse:min-h-11"><RadioGroupItem id="publish-now" value="now" />{{ t('entry.publish.now') }}</Label>
      <Label for="publish-later" class="min-h-10 cursor-pointer gap-2 rounded-md border px-3 py-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent pointer-coarse:min-h-11"><RadioGroupItem id="publish-later" value="later" />{{ t('entry.publish.later') }}</Label>
    </RadioGroup>
    <div v-if="when === 'later'" class="grid max-w-80 gap-1.5">
      <Label for="publish-at" class="font-medium">{{ t('entry.publish.dateTime') }}</Label>
      <ScheduleField v-model:local="at" v-model:picked="picked" :zone="timeZone" input-id="publish-at" />
    </div>
    <p v-if="error" class="rounded-md bg-destructive/10 px-3 py-2.5 font-medium text-destructive" role="alert">{{ error }}</p>
    <div class="flex flex-wrap gap-2">
      <Button type="button" :disabled="busy" @click="emit('publish')">{{ when === 'now' ? t('entry.publish.publishNow') : t('entry.publish.schedule') }}</Button>
      <Button v-if="scheduled" type="button" variant="outline" :disabled="busy" @click="emit('clearSchedule')">{{ t('entry.publish.clearSchedule') }}</Button>
      <Button type="button" variant="ghost" @click="emit('cancel')">{{ t('entry.cancel') }}</Button>
    </div>
  </div>
</template>
