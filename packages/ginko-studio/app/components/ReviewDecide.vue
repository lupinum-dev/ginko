<!-- The decisions on one open proposal (UI.md 10.4): Approve, and Reject… with its reason. A change for a later day is
     a dated change its author asks for with the day, so a yes is always for now (D130).
     Shared by the inline row (phones, narrow screens, releases) and the detail next to the list (wide screens).
     A decision needs the diff first: Approve and Reject stay off until it has loaded, so nobody approves unseen. -->
<script setup lang="ts">
import { useI18n } from '#imports'
import { Button } from '@studio/components/ui/button'
import { Label } from '@studio/components/ui/label'
import { Textarea } from '@studio/components/ui/textarea'
import { nextTick, ref } from 'vue'

const props = defineProps<{
  proposal: string
  /** The diff has loaded (or failed: then only Reject is possible, so a broken proposal can still leave the inbox). */
  ready: boolean
  failed?: boolean
  busy: boolean
  /** No longer fits, or decided with its release: only Reject. */
  rejectOnly: boolean
  /** The bigger buttons of the detail footer. */
  large?: boolean
}>()
const emit = defineEmits<{ approve: []; reject: [reason: string] }>()
const { t } = useI18n()

const mode = ref<'reject' | null>(null)
const reason = ref('')

// Opening the form moves the focus into it; cancelling puts it back on the button that opened it. Without this the
// button is removed with the actions and the focus drops to the top of the page.
function focusId(id: string) { nextTick(() => document.getElementById(id)?.focus()) }
function openReject() {
  mode.value = 'reject'
  focusId(`why-${props.proposal}`)
}
function cancel() {
  mode.value = null
  focusId(`reject-${props.proposal}`)
}
function sendReject() {
  if (reason.value.trim()) emit('reject', reason.value.trim())
}
</script>

<template>
  <div v-if="!mode" class="flex flex-wrap gap-2">
    <Button v-if="!rejectOnly" type="button" :size="large ? 'default' : 'sm'" :disabled="busy || !ready" @click="emit('approve')">{{ t('review.approve') }}</Button>
    <Button :id="`reject-${proposal}`" type="button" variant="outline" :size="large ? 'default' : 'sm'" :disabled="busy || !(ready || failed)" @click="openReject">{{ t('review.reject') }}</Button>
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
