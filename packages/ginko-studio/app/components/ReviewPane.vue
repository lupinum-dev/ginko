<!-- The selected proposal next to the list on wide screens (UI.md 10.4): what it says, who proposed it and when, a link
     to its entry, the diff (Before | After side by side when there is room), and the decisions in a footer that stays
     in view while a long diff scrolls. Presentational, like ReviewRow: ReviewItem loads the diff and decides. -->
<script setup lang="ts">
import { useI18n } from '#imports'
import type { Fields, Locale } from '@lupinum/ginko'
import { ArrowUpRightIcon } from '@lucide/vue'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { Skeleton } from '@studio/components/ui/skeleton'
import { computed } from 'vue'
import { useTextOf } from '../composables/useTextOf'
import { byText } from '../utils/who'
import { whenFull } from '../utils/when'
import type { DiffField, ProposalRow } from '../utils/review'
import ChangeDiff from './ChangeDiff.vue'
import ReviewDecide from './ReviewDecide.vue'

const props = defineProps<{
  proposal: ProposalRow
  detail?: { diff: readonly DiffField[] }
  busy: boolean
  error: string
  fields?: Fields
  locale: Locale
  timeZone: string
  site: string
  area?: string
  /** Where the entry is edited; none for a new entry that does not exist yet. */
  entryTo?: string
}>()
const emit = defineEmits<{ approve: [at?: number]; reject: [reason: string] }>()
const { t, format } = useI18n()

const textOf = useTextOf(() => ({ timeZone: props.timeZone, main: props.locale }))
const line = computed(() => textOf(props.proposal.msg, props.proposal.sentence))
const stale = computed(() => props.proposal.status === 'stale' || !!props.proposal.conflict)
const staleReason = computed(() => {
  const { status, reason, reasonMsg, conflict, conflictMsg } = props.proposal
  const [text, msg] = status === 'stale' ? [reason, reasonMsg] : [conflict, conflictMsg]
  return text ? textOf(msg, text) : ''
})
const who = computed(() => byText(props.proposal.author, props.proposal.via, props.proposal.agent, t))
const when = computed(() => whenFull(props.proposal.createdAt, props.timeZone, format))
</script>

<template>
  <section
    id="review-detail"
    data-testid="proposal-open"
    class="sticky top-[calc(var(--studio-header-height)+1.5rem)] flex max-h-[calc(100dvh-var(--studio-header-height)-3rem)] min-w-0 flex-col overflow-hidden rounded-xl border bg-card"
    aria-labelledby="review-detail-title"
  >
    <header class="grid gap-3 border-b px-5 py-4">
      <div class="flex items-start gap-3">
        <div class="grid min-w-0 flex-1 gap-1">
          <h2 id="review-detail-title" tabindex="-1" class="text-[15px] outline-none font-semibold [overflow-wrap:anywhere]">{{ line }}</h2>
          <p class="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">{{ who }} · <span class="tabular-nums">{{ when }}</span></p>
        </div>
        <Button v-if="entryTo" as-child variant="ghost" size="sm" class="-mt-1 -mr-2 shrink-0 text-muted-foreground">
          <NuxtLink :to="entryTo">{{ t('review.openEntry') }}<ArrowUpRightIcon class="size-4" aria-hidden="true" /></NuxtLink>
        </Button>
      </div>
      <div v-if="area || stale || (proposal.mine && !proposal.canDecide)" class="flex flex-wrap items-center gap-1.5">
        <Badge v-if="area" variant="outline" class="font-normal text-muted-foreground">{{ area }}</Badge>
        <Badge v-if="stale" variant="warning">{{ t('review.stale') }}</Badge>
        <Badge v-if="proposal.mine && !proposal.canDecide" variant="soft">{{ t('review.mine') }}</Badge>
      </div>
      <p v-if="stale && staleReason" class="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">{{ staleReason }}</p>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
      <ChangeDiff v-if="detail" :diff="detail.diff" :fields="fields" :locale="locale" :site="site" split />
      <div v-else-if="!error" class="grid gap-3" aria-hidden="true">
        <Skeleton class="h-4 w-32" />
        <div class="grid grid-cols-2 gap-3"><Skeleton class="h-16" /><Skeleton class="h-16" /></div>
        <Skeleton class="h-4 w-40" />
        <Skeleton class="h-10 w-full" />
      </div>
      <p v-if="error" class="mt-3 rounded-md bg-destructive/10 px-3 py-2.5 font-medium text-destructive" role="alert">{{ error }}</p>
    </div>

    <!-- The hint above the buttons: beside them, it would squeeze the reason form that replaces them. -->
    <footer v-if="proposal.canDecide" class="grid gap-2 border-t bg-sidebar px-5 py-3">
      <p v-if="stale" class="text-[13px] text-muted-foreground">{{ t('review.onlyReject') }}</p>
      <ReviewDecide
        :proposal="proposal.proposal" :ready="!!detail" :failed="!!error" :busy="busy"
        :reject-only="stale" :time-zone="timeZone" large
        @approve="(at) => emit('approve', at)" @reject="(reason) => emit('reject', reason)"
      />
    </footer>
  </section>
</template>
