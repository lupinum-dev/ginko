<!-- One open proposal in the approval inbox (UI.md 10.4). Presentational: ReviewItem loads the diff and runs the
     decisions. Two forms: a row that expands in place with its diff and decisions (phones, narrow screens, releases),
     or, with `select`, a row of the list next to the detail (wide screens) that only selects. Own proposals show no
     actions; a proposal that no longer fits can only be rejected; a member of a release is decided with the release,
     so it can only be rejected too. -->
<script setup lang="ts">
import { useI18n } from '#imports'
import type { Fields, Locale } from '@lupinum/ginko'
import { Badge } from '@studio/components/ui/badge'
import { Skeleton } from '@studio/components/ui/skeleton'
import { ChevronDownIcon } from '@lucide/vue'
import { useIntervalFn, useMounted, useNow } from '@vueuse/core'
import { computed } from 'vue'
import { useTextOf } from '../composables/useTextOf'
import { byText } from '../utils/who'
import { whenFull } from '../utils/when'
import type { DiffField, ProposalRow } from '../utils/review'
import ChangeDiff from './ChangeDiff.vue'
import ReviewDecide from './ReviewDecide.vue'

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
  /** The area's name, shown as a tag. */
  area?: string
  /** A row of the list beside the detail: it selects (`open` = selected) and shows no diff itself. */
  select?: boolean
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
// How long it waits, after mounting: the text depends on the clock, so the server render keeps the date. The clock
// ticks each minute, so "2 minutes ago" moves on while the page stays open.
const mounted = useMounted()
const now = useNow({ scheduler: (tick) => useIntervalFn(tick, 60_000) })
const waited = computed(() => (mounted.value ? format.relative(props.proposal.createdAt, now.value.getTime()) : when.value))
</script>

<template>
  <li :id="proposal.proposal" data-proposal class="relative grid gap-2 px-4 py-3" :class="select && (open ? 'bg-accent' : 'hover:bg-foreground/[0.03]')">
    <span v-if="select && open" class="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden="true" />
    <button
      type="button"
      class="flex min-h-11 items-start gap-2 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/80"
      :class="select && 'after:absolute after:inset-0'"
      :aria-expanded="select ? undefined : open"
      :aria-current="select && open ? 'true' : undefined"
      :aria-controls="select ? 'review-detail' : undefined"
      @click="emit('toggle')"
    >
      <span class="grid min-w-0 flex-1 gap-0.5">
        <span class="font-medium [overflow-wrap:anywhere] min-[900px]:text-sm" :class="select && 'line-clamp-2'">{{ line }}</span>
        <span class="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
          <span>{{ who }}</span> · <time class="tabular-nums" :datetime="new Date(proposal.createdAt).toISOString()" :title="when">{{ waited }}</time>
          <Badge v-if="area && !select" variant="outline" class="ml-1 font-normal text-muted-foreground">{{ area }}</Badge>
        </span>
      </span>
      <ChevronDownIcon v-if="!select" class="mt-1 size-4 shrink-0 text-muted-foreground transition-transform" :class="open && 'rotate-180'" aria-hidden="true" />
    </button>
    <div v-if="(select && (area || stale)) || (proposal.mine && !proposal.canDecide)" class="flex flex-wrap items-center gap-1.5">
      <Badge v-if="select && area" variant="outline" class="font-normal text-muted-foreground">{{ area }}</Badge>
      <Badge v-if="select && stale" variant="warning">{{ t('review.stale') }}</Badge>
      <Badge v-if="proposal.mine && !proposal.canDecide" variant="soft">{{ t('review.mine') }}</Badge>
    </div>
    <div v-if="!select && stale" class="flex flex-wrap items-center gap-2">
      <Badge variant="warning">{{ t('review.stale') }}</Badge>
      <span v-if="staleReason" class="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">{{ staleReason }}</span>
    </div>

    <div v-if="open && !select" class="grid gap-3">
      <ChangeDiff v-if="detail" :diff="detail.diff" :fields="fields" :locale="props.locale" :site="props.site" split />
      <div v-else-if="!error" class="grid gap-2" aria-hidden="true">
        <Skeleton class="h-4 w-32" />
        <Skeleton class="h-14 w-full" />
      </div>
      <ReviewDecide
        v-if="proposal.canDecide"
        :proposal="proposal.proposal" :ready="!!detail" :failed="!!error" :busy="busy"
        :reject-only="stale || !!inRelease" :time-zone="timeZone"
        @approve="(at) => emit('approve', at)" @reject="(reason) => emit('reject', reason)"
      />
      <p v-if="error" class="rounded-md bg-destructive/10 px-3 py-2.5 font-medium text-destructive" role="alert">{{ error }}</p>
    </div>
  </li>
</template>
