<!-- One proposal of the inbox with its decisions (UI.md 10.4): loads the diff and runs approve / reject.
     The row leaves the list by itself, because the list is a live query. `variant`: the row that expands in place
     (default), a row of the wide list that only selects (no diff loaded), or the detail beside that list. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Schema } from '@lupinum/ginko/internal'
import { opErrorOf } from '../composables/useOps'
import { useTextOf } from '../composables/useTextOf'
import { entryPath } from '../utils/basics'
import { useStudioSite } from '../utils/labels'
import { whenText } from '../utils/when'
import type { ProposalRow } from '../utils/review'

const props = defineProps<{ site: string; schema: Schema; proposal: ProposalRow; open: boolean; inRelease?: boolean; variant?: 'row' | 'select' | 'pane' }>()
const emit = defineEmits<{ toggle: [] }>()
const { t, format } = useI18n()
const textOf = useTextOf(() => ({ timeZone: props.schema.timeZone, main: props.schema.locales[0] }))
const { show } = useToast()
const ops = useOps(computed(() => props.site))
const { shown } = useStudioSite()

// Only the diff needs `get`; the stale badge ("No longer fits") comes with the list row.
const detail = useConvexQuery(api.proposals.get, () => (props.open && props.variant !== 'select' ? { site: props.site, proposal: props.proposal.proposal } : 'skip'))
const approveMutation = useConvexMutation(api.proposals.approve)
const rejectMutation = useConvexMutation(api.proposals.reject)

const busy = ref(false)
const error = ref('')
const brick = computed(() => (Object.hasOwn(props.schema.bricks, props.proposal.brick) ? props.schema.bricks[props.proposal.brick] : undefined))
const fields = computed(() => brick.value?.fields)
const area = computed(() => (brick.value ? shown(brick.value.label) : undefined))
const entryTo = computed(() => (props.proposal.entry && brick.value ? entryPath(props.site, props.schema, props.proposal.brick, props.proposal.entry) : undefined))
const shownError = computed(() => error.value || (detail.error.value ? opErrorOf(detail.error.value).message : ''))

async function approve(at?: number) {
  busy.value = true
  error.value = ''
  try {
    const result = await approveMutation.mutate({ proposal: props.proposal.proposal, at }) as { status: string; change?: string | null; liveFrom?: string; reason?: string; reasonMsg?: { key: string; params?: Record<string, unknown> } | null }
    if (result.status === 'stale') show(result.reason ? textOf(result.reasonMsg, result.reason) : t('review.stale'), { tone: 'err' })
    else if (result.status === 'scheduled' && at !== undefined) show(t('ops.scheduled', { time: whenText(at, props.schema.timeZone, format) }))
    else {
      const change = result.change
      show(`${t('review.approved')} ${ops.liveText(result)}`, change ? { action: { label: t('ops.undo'), run: () => ops.undoChange(change) } } : {})
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
  <ReviewPane
    v-if="variant === 'pane'"
    :proposal="proposal"
    :detail="detail.data.value ?? undefined"
    :busy="busy"
    :error="shownError"
    :fields="fields"
    :locale="schema.locales[0]!"
    :time-zone="schema.timeZone"
    :site="site"
    :area="area"
    :entry-to="entryTo"
    @approve="approve"
    @reject="reject"
  />
  <ReviewRow
    v-else
    :proposal="proposal"
    :detail="detail.data.value ?? undefined"
    :open="open"
    :busy="busy"
    :error="shownError"
    :fields="fields"
    :locale="schema.locales[0]!"
    :time-zone="schema.timeZone"
    :in-release="inRelease"
    :site="site"
    :area="area"
    :select="variant === 'select'"
    @toggle="emit('toggle')"
    @approve="approve"
    @reject="reject"
  />
</template>
