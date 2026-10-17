<!-- "Online ab …" (SPEC 15): one date-and-time input in the site's zone, for the publish panel and "Approve later".
     A time the clocks skip is named as missing; a time they repeat asks which one is meant, with no default. `picked`
     is the instant to send, undefined until there is exactly one. -->
<script setup lang="ts">
import { useI18n } from '#imports'
import { Input } from '@studio/components/ui/input'
import { Label } from '@studio/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@studio/components/ui/radio-group'
import { computed, ref, watch } from 'vue'
import { clockWithZone, msToZoned, zonedTimes } from '../utils/when'
import SiteZoneNote from './SiteZoneNote.vue'

const props = defineProps<{ zone: string; inputId: string }>()
const local = defineModel<string>('local', { required: true })
const picked = defineModel<number>('picked')
const { t, format } = useI18n()

// From now to a year ahead, read when the form opens.
const now = Date.now()
const min = msToZoned(now, props.zone)
const max = msToZoned(now + 365 * 86_400_000, props.zone)

const times = computed(() => zonedTimes(local.value, props.zone))
const missing = computed(() => times.value?.length === 0)
const twice = computed(() => (times.value?.length === 2 ? times.value : undefined))
/** The chosen one of two; a time already planned inside the doubled hour starts chosen. */
const chosen = ref(picked.value)
watch([times, chosen], ([list, choice]) => {
  picked.value = list?.length === 1 ? list[0] : choice !== undefined && list?.includes(choice) ? choice : undefined
}, { immediate: true })
</script>

<template>
  <Input :id="inputId" v-model="local" type="datetime-local" :min="min" :max="max" required :aria-invalid="missing || undefined" :aria-describedby="missing ? `${inputId}-missing` : undefined" />
  <SiteZoneNote :zone="zone" input />
  <p v-if="missing" :id="`${inputId}-missing`" class="text-sm font-medium text-destructive" role="alert">{{ t('entry.publish.timeMissing') }}</p>
  <div v-if="twice" class="grid gap-2">
    <p :id="`${inputId}-twice`" class="text-sm">{{ t('entry.publish.timeTwice') }}</p>
    <RadioGroup :model-value="chosen" class="grid gap-2" :aria-labelledby="`${inputId}-twice`" @update:model-value="(value) => { if (typeof value === 'number') chosen = value }">
      <Label v-for="(ms, index) in twice" :key="ms" :for="`${inputId}-${index}`" class="min-h-10 cursor-pointer gap-2 rounded-md border border-input px-3 py-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent pointer-coarse:min-h-11">
        <RadioGroupItem :id="`${inputId}-${index}`" :value="ms" />{{ t(index === 0 ? 'entry.publish.timeTwiceFirst' : 'entry.publish.timeTwiceSecond', { time: clockWithZone(ms, zone, format) }) }}
      </Label>
    </RadioGroup>
  </div>
</template>
