<!-- The decisions on one open proposal (UI.md 10.4): Approve, Approve for later… with its time, Reject… with its reason.
     Shared by the inline row (phones, narrow screens, releases) and the detail next to the list (wide screens).
     A decision needs the diff first: Approve and Reject stay off until it has loaded, so nobody approves unseen. -->
<script setup lang="ts">
import { useI18n } from '#imports'
import { Button } from '@studio/components/ui/button'
import { Label } from '@studio/components/ui/label'
import { Textarea } from '@studio/components/ui/textarea'
import { nextTick, ref } from 'vue'
import { msToZoned, scheduleProblem } from '../utils/when'
import ScheduleField from './ScheduleField.vue'

const props = defineProps<{
  proposal: string
  /** The diff has loaded (or failed: then only Reject is possible, so a broken proposal can still leave the inbox). */
  ready: boolean
  failed?: boolean
  busy: boolean
  /** No longer fits, or decided with its release: only Reject. */
  rejectOnly: boolean
  timeZone: string
  /** The bigger buttons of the detail footer. */
  large?: boolean
}>()
const emit = defineEmits<{ approve: [at?: number]; reject: [reason: string] }>()
const { t } = useI18n()

const mode = ref<'later' | 'reject' | null>(null)
const at = ref('')
/** The instant `at` names (ScheduleField); undefined while it names none or two. */
const picked = ref<number>()
const reason = ref('')
const timeError = ref('')

// Opening a form moves the focus into it; cancelling puts it back on the button that opened it. Without this the
// button is removed with the actions and the focus drops to the top of the page.
function focusId(id: string) { nextTick(() => document.getElementById(id)?.focus()) }
function openReject() {
  mode.value = 'reject'
  focusId(`why-${props.proposal}`)
}
function cancel() {
  const opener = mode.value === 'later' ? 'later' : 'reject'
  mode.value = null
  focusId(`${opener}-${props.proposal}`)
}
function openLater() {
  const day = 24 * 60 * 60 * 1000
  at.value = `${msToZoned(Date.now() + day, props.timeZone).slice(0, 10)}T09:00`
  picked.value = undefined
  timeError.value = ''
  mode.value = 'later'
  focusId(`at-${props.proposal}`)
}
function schedule() {
  const problem = scheduleProblem(at.value, props.timeZone, picked.value, Date.now())
  timeError.value = problem && problem !== 'entry.publish.timeMissing' ? t(problem) : ''
  if (problem === 'entry.publish.timeMissing') focusId(`at-${props.proposal}`)
  if (problem || picked.value === undefined) return
  emit('approve', picked.value)
}
function sendReject() {
  if (reason.value.trim()) emit('reject', reason.value.trim())
}
</script>

<template>
  <div v-if="!mode" class="flex flex-wrap gap-2">
    <Button v-if="!rejectOnly" type="button" :size="large ? 'default' : 'sm'" :disabled="busy || !ready" @click="emit('approve')">{{ t('review.approve') }}</Button>
    <Button v-if="!rejectOnly" :id="`later-${proposal}`" type="button" variant="outline" :size="large ? 'default' : 'sm'" :disabled="busy || !ready" @click="openLater">{{ t('review.approveLater') }}</Button>
    <Button :id="`reject-${proposal}`" type="button" variant="outline" :size="large ? 'default' : 'sm'" :disabled="busy || !(ready || failed)" @click="openReject">{{ t('review.reject') }}</Button>
  </div>
  <div v-else-if="mode === 'later'" class="grid gap-2">
    <Label :for="`at-${proposal}`" class="font-medium">{{ t('entry.publish.dateTime') }}</Label>
    <div class="grid max-w-sm gap-2"><ScheduleField v-model:local="at" v-model:picked="picked" :zone="timeZone" :input-id="`at-${proposal}`" /></div>
    <p v-if="timeError" class="font-medium text-destructive" role="alert">{{ timeError }}</p>
    <div class="flex flex-wrap gap-2">
      <Button type="button" :size="large ? 'default' : 'sm'" :disabled="busy" @click="schedule">{{ t('entry.publish.schedule') }}</Button>
      <Button type="button" variant="ghost" :size="large ? 'default' : 'sm'" @click="cancel">{{ t('entry.cancel') }}</Button>
    </div>
  </div>
  <div v-else class="grid gap-2">
    <Label :for="`why-${proposal}`" class="font-medium">{{ t('review.reason') }}</Label>
    <Textarea :id="`why-${proposal}`" v-model="reason" rows="2" maxlength="300" required />
    <div class="flex flex-wrap gap-2">
      <Button type="button" variant="destructive" :size="large ? 'default' : 'sm'" :disabled="busy || !reason.trim()" @click="sendReject">{{ t('review.rejectConfirm') }}</Button>
      <Button type="button" variant="ghost" :size="large ? 'default' : 'sm'" @click="cancel">{{ t('entry.cancel') }}</Button>
    </div>
  </div>
</template>
