<!-- One open proposal in the approval inbox (UI.md 10.4). Presentational: ReviewItem loads the diff and
     runs the decisions. Own proposals show no actions; a proposal that no longer fits can only be rejected;
     a member of a release is decided with the release, so it can only be rejected too. -->
<script setup lang="ts">
import { useI18n } from '#imports'
import type { Fields, Locale } from '@lupinum/ginko'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { Label } from '@studio/components/ui/label'
import { Textarea } from '@studio/components/ui/textarea'
import { computed, nextTick, ref } from 'vue'
import { useTextOf } from '../composables/useTextOf'
import { byText } from '../utils/who'
import { msToZoned, scheduleProblem, whenFull } from '../utils/when'
import type { DiffField, ProposalRow } from '../utils/review'
import ChangeDiff from './ChangeDiff.vue'
import ScheduleField from './ScheduleField.vue'

const props = defineProps<{
  proposal: ProposalRow
  /** `proposals.get`, once loaded (when the row is open): the diff. */
  detail?: { diff: readonly DiffField[] }
  open: boolean
  busy: boolean
  error: string
  fields?: Fields
  locale: Locale
  timeZone: string
  inRelease?: boolean
  /** The site, for the thumbnails of pictures in a rich text. */
  site?: string
}>()
const emit = defineEmits<{ toggle: []; approve: [at?: number]; reject: [reason: string] }>()
const { t, format } = useI18n()

const textOf = useTextOf(() => ({ timeZone: props.timeZone, main: props.locale }))
const line = computed(() => textOf(props.proposal.msg, props.proposal.sentence))
// The row itself says whether it no longer fits (`conflict`, from proposals.list); a decided stale one keeps its `reason`.
const stale = computed(() => props.proposal.status === 'stale' || !!props.proposal.conflict)
const staleReason = computed(() => {
  const { status, reason, reasonMsg, conflict, conflictMsg } = props.proposal
  const [text, msg] = status === 'stale' ? [reason, reasonMsg] : [conflict, conflictMsg]
  return text ? textOf(msg, text) : ''
})
const who = computed(() => byText(props.proposal.author, props.proposal.via, props.proposal.agent, t))
const when = computed(() => whenFull(props.proposal.createdAt, props.timeZone, format))

const mode = ref<'later' | 'reject' | null>(null)
const at = ref('')
/** The instant `at` names (ScheduleField); undefined while it names none or two. */
const picked = ref<number>()
const reason = ref('')
const timeError = ref('')

// Opening a form moves the focus into it; cancelling puts it back on the button that opened it. Without this the
// button is removed with the row actions and the focus drops to the top of the page.
function focusId(id: string) { nextTick(() => document.getElementById(id)?.focus()) }
function openReject() {
  mode.value = 'reject'
  focusId(`why-${props.proposal.proposal}`)
}
function cancel() {
  const opener = mode.value === 'later' ? 'later' : 'reject'
  mode.value = null
  focusId(`${opener}-${props.proposal.proposal}`)
}
function openLater() {
  const day = 24 * 60 * 60 * 1000
  at.value = `${msToZoned(Date.now() + day, props.timeZone).slice(0, 10)}T09:00`
  picked.value = undefined
  timeError.value = ''
  mode.value = 'later'
  focusId(`at-${props.proposal.proposal}`)
}
function schedule() {
  const problem = scheduleProblem(at.value, props.timeZone, picked.value, Date.now())
  timeError.value = problem && problem !== 'entry.publish.timeMissing' ? t(problem) : ''
  if (problem === 'entry.publish.timeMissing') focusId(`at-${props.proposal.proposal}`)
  if (problem || picked.value === undefined) return
  emit('approve', picked.value)
}
function sendReject() {
  if (reason.value.trim()) emit('reject', reason.value.trim())
}
</script>

<template>
  <li :id="proposal.proposal" class="grid gap-2 border-b px-4 py-3 last:border-b-0">
    <button type="button" class="grid min-h-11 gap-0.5 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/80" :aria-expanded="open" @click="emit('toggle')">
      <span class="font-medium">{{ line }}</span>
      <span class="text-[13px] text-muted-foreground">{{ who }} · {{ when }}</span>
    </button>
    <div v-if="stale" class="flex flex-wrap items-center gap-2">
      <Badge variant="warning">{{ t('review.stale') }}</Badge>
      <span v-if="staleReason" class="text-[13px] text-muted-foreground">{{ staleReason }}</span>
    </div>
    <div v-if="proposal.mine && !proposal.canDecide"><Badge variant="soft">{{ t('review.mine') }}</Badge></div>

    <div v-if="open" class="grid gap-3">
      <ChangeDiff v-if="detail" :diff="detail.diff" :fields="fields" :locale="props.locale" :site="props.site" />
      <template v-if="proposal.canDecide">
        <div v-if="!mode" class="flex flex-wrap gap-2">
          <Button v-if="!stale && !inRelease" type="button" size="sm" :disabled="busy" @click="emit('approve')">{{ t('review.approve') }}</Button>
          <Button v-if="!stale && !inRelease" :id="`later-${proposal.proposal}`" type="button" variant="secondary" size="sm" :disabled="busy" @click="openLater">{{ t('review.approveLater') }}</Button>
          <Button :id="`reject-${proposal.proposal}`" type="button" variant="ghost" size="sm" :disabled="busy" @click="openReject">{{ t('review.reject') }}</Button>
        </div>
        <div v-else-if="mode === 'later'" class="grid gap-2">
          <Label :for="`at-${proposal.proposal}`" class="font-medium">{{ t('entry.publish.dateTime') }}</Label>
          <ScheduleField v-model:local="at" v-model:picked="picked" :zone="timeZone" :input-id="`at-${proposal.proposal}`" />
          <p v-if="timeError" class="font-medium text-destructive" role="alert">{{ timeError }}</p>
          <div class="flex flex-wrap gap-2">
            <Button type="button" size="sm" :disabled="busy" @click="schedule">{{ t('entry.publish.schedule') }}</Button>
            <Button type="button" variant="ghost" size="sm" @click="cancel">{{ t('entry.cancel') }}</Button>
          </div>
        </div>
        <div v-else class="grid gap-2">
          <Label :for="`why-${proposal.proposal}`" class="font-medium">{{ t('review.reason') }}</Label>
          <Textarea :id="`why-${proposal.proposal}`" v-model="reason" rows="2" maxlength="300" required />
          <div class="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" size="sm" :disabled="busy || !reason.trim()" @click="sendReject">{{ t('review.rejectConfirm') }}</Button>
            <Button type="button" variant="ghost" size="sm" @click="cancel">{{ t('entry.cancel') }}</Button>
          </div>
        </div>
      </template>
      <p v-if="error" class="rounded-md bg-destructive/10 px-3 py-2.5 font-medium text-destructive" role="alert">{{ error }}</p>
    </div>
  </li>
</template>
