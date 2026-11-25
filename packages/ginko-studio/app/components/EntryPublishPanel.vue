<!-- "Veröffentlichen …" (SPEC 15): a draft goes online now or at a time in the site's zone; the unpublished changes of
     an online entry (`byDay`) go online now or from a later day, as a dated change (D125, D131). The editor owns the
     state and the calls; this is the panel, in the phone save bar or in the desktop status card. -->
<script setup lang="ts">
import { Button } from '@studio/components/ui/button'
import { Label } from '@studio/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@studio/components/ui/radio-group'
import ScheduleField from './ScheduleField.vue'
import StartsOnField from './StartsOnField.vue'
import { RADIO_CARD } from './fields/sizes'

defineProps<{ question: string; timeZone: string; scheduled: boolean; busy: boolean; error: string; byDay?: boolean; dayError?: string }>()
const when = defineModel<'now' | 'later'>('when', { required: true })
const at = defineModel<string>('at', { required: true })
const picked = defineModel<number | undefined>('picked')
const day = defineModel<string>('day', { default: '' })
const emit = defineEmits<{ publish: []; clearSchedule: []; cancel: [] }>()
const { t } = useI18n()
</script>

<template>
  <!-- The one green panel of the editor: the leaf corner and the tint say "this goes to the website". -->
  <div class="grid basis-full gap-3.5 rounded-2xl rounded-bl-[4px] border border-ring bg-accent/50 p-4 min-[900px]:px-5 min-[900px]:py-[18px]" role="group" aria-labelledby="publish-title">
    <p id="publish-title" class="text-base leading-[1.3] font-semibold">{{ question }}</p>
    <RadioGroup v-model="when" class="flex flex-wrap gap-2" aria-labelledby="publish-title">
      <Label for="publish-now" :class="RADIO_CARD"><RadioGroupItem id="publish-now" value="now" />{{ t('entry.publish.now') }}</Label>
      <Label for="publish-later" :class="RADIO_CARD"><RadioGroupItem id="publish-later" value="later" />{{ byDay ? t('entry.publish.laterDay') : t('entry.publish.later') }}</Label>
    </RadioGroup>
    <StartsOnField v-if="when === 'later' && byDay" id="publish-day" v-model="day" class="max-w-80" :time-zone="timeZone" :error="dayError" />
    <div v-else-if="when === 'later'" class="grid max-w-80 gap-1.5">
      <Label for="publish-at" class="font-medium">{{ t('entry.publish.dateTime') }}</Label>
      <ScheduleField v-model:local="at" v-model:picked="picked" :zone="timeZone" input-id="publish-at" />
    </div>
    <p v-if="error" class="rounded-md bg-destructive/10 px-3 py-2.5 font-medium text-destructive" role="alert">{{ error }}</p>
    <div class="flex flex-wrap gap-2">
      <Button type="button" size="lg" class="px-4 font-semibold" :disabled="busy" @click="emit('publish')">{{ when === 'now' ? t('entry.publish.publishNow') : t('entry.publish.schedule') }}</Button>
      <Button v-if="scheduled" type="button" variant="outline" size="lg" class="px-3.5" :disabled="busy" @click="emit('clearSchedule')">{{ t('entry.publish.clearSchedule') }}</Button>
      <Button type="button" variant="ghost" size="lg" class="px-3.5" @click="emit('cancel')">{{ t('entry.cancel') }}</Button>
    </div>
  </div>
</template>
