<!-- One proposal of the inbox with its decisions (UI.md 10.4): loads the diff and runs approve / reject.
     The row leaves the list by itself, because the list is a live query. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Schema } from '@lupinum/ginko'
import { opErrorOf } from '../composables/useOps'
import { useTextOf } from '../composables/useTextOf'
import { whenText } from '../utils/when'
import type { ProposalRow } from '../utils/review'

const props = defineProps<{ site: string; schema: Schema; proposal: ProposalRow; open: boolean; inRelease?: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const { t, format } = useI18n()
const textOf = useTextOf(() => ({ timeZone: props.schema.timezone, main: props.schema.locales[0] }))
const { show } = useToast()
const ops = useOps(computed(() => props.site))

// Only the diff needs `get`; the stale badge ("No longer fits") comes with the list row.
const detail = useConvexQuery(api.proposals.get, () => (props.open ? { site: props.site, proposal: props.proposal.proposal } : 'skip'))
const approveMutation = useConvexMutation(api.proposals.approve)
const rejectMutation = useConvexMutation(api.proposals.reject)

const busy = ref(false)
const error = ref('')
const fields = computed(() => {
  const brick = Object.hasOwn(props.schema.bricks, props.proposal.brick) ? props.schema.bricks[props.proposal.brick] : undefined
  return brick?.fields
})

async function approve(at?: number) {
  busy.value = true
  error.value = ''
  try {
    const result = await approveMutation.mutate({ proposal: props.proposal.proposal, at }) as { status: string; change?: string | null; reason?: string; reasonMsg?: { key: string; params?: Record<string, unknown> } | null }
    if (result.status === 'stale') show(result.reason ? textOf(result.reasonMsg, result.reason) : t('review.stale'), { tone: 'err' })
    else if (result.status === 'scheduled' && at !== undefined) show(t('ops.scheduled', { time: whenText(at, props.schema.timezone, format) }))
    else {
      const change = result.change
      show(t('review.approved'), change ? { action: { label: t('ops.undo'), run: () => ops.undoChange(change) } } : {})
    }
  } catch (e) {
    error.value = opErrorOf(e).message
  } finally {
    busy.value = false
  }
}

async function reject(reason: string) {
  busy.value = true
  error.value = ''
  try {
    await rejectMutation.mutate({ proposal: props.proposal.proposal, reason })
    show(t('review.rejected'))
  } catch (e) {
    error.value = opErrorOf(e).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ReviewRow
    :proposal="proposal"
    :detail="detail.data.value ?? undefined"
    :open="open"
    :busy="busy"
    :error="error || (detail.error.value ? opErrorOf(detail.error.value).message : '')"
    :fields="fields"
    :locale="schema.locales[0]!"
    :time-zone="schema.timezone"
    :in-release="inRelease"
    @toggle="emit('toggle')"
    @approve="approve"
    @reject="reject"
  />
</template>
