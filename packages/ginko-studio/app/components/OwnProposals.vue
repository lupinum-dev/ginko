<!-- "Waiting for approval" at the top of History (UI.md 10.4): the person's own open proposals, each
     with Withdraw; below, their proposals rejected in the last two weeks with the approver's sentence
     (UI.md 10.7 item 6: a rejection writes no change row) and, for one made in the Studio, "Korrigieren", which reopens it
     in its task while it is still the thing to fix (the server drops it after a newer proposal or a later change), and planned changes that did not go live
     because they no longer fitted at their time (for approvers all of the site). Nothing shows when
     there is none of them. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Schema } from '@lupinum/ginko/internal'
import { useTextOf } from '../composables/useTextOf'
import { isYou, whoText } from '../utils/who'
import { whenFull } from '../utils/when'
import ProposalWithdraw from './ProposalWithdraw.vue'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'

const props = defineProps<{
  site: string
  schema: Schema
  filter: 'all' | 'mine' | 'ai' | 'entry'
  entry?: string
  /** Owners and admins hold every task; staff hold their grants: "Korrigieren" needs the proposal's task. */
  manager: boolean
  grants: ReadonlySet<string>
}>()
const { t, format } = useI18n()

// The server picks the rows (own open ones, own recent rejections, recent failed plans); the History filter narrows them.
const mine = useConvexQuery(api.proposals.mine, () => ({ site: props.site }))
type Row = NonNullable<typeof mine.data.value>['open'][number]
const matches = (p: Row) => (props.filter !== 'mine' || p.mine) && (props.filter !== 'ai' || p.via === 'agent') && (props.filter !== 'entry' || p.entry === props.entry)
const rows = computed(() => (mine.data.value?.open ?? []).filter(matches))
const rejected = computed(() => (mine.data.value?.rejected ?? []).filter(matches))
const notLive = computed(() => (mine.data.value?.notLive ?? []).filter(matches))

const textOf = useTextOf(() => ({ timeZone: props.schema.timeZone, main: props.schema.locales[0] }))
const line = (p: Row) => textOf(p.msg, p.sentence)
const rejectedText = (p: Row) => {
  const reason = textOf(p.reasonMsg, p.reason ?? '')
  return isYou(p.decidedBy) ? t('history.rejectedByYou', { reason }) : t('history.rejectedBy', { who: p.decidedBy ? whoText(p.decidedBy, t) : t('who.member'), reason })
}
const notLiveText = (p: Row) => t('history.notLiveBecause', { when: when(p.at!), reason: textOf(p.reasonMsg, p.reason ?? '') })
const when = (at: number) => whenFull(at, props.schema.timeZone, format)
/** Schnell ändern opens the proposal's task on its entry with the proposal's values; it follows up only on proposals made in the Studio. */
const fixLink = (p: Row) => (p.via === 'ui' && p.task && p.entry && (props.manager || props.grants.has(p.task)) ? `/s/${props.site}?task=${encodeURIComponent(p.task)}&reopen=${p.proposal}` : undefined)
</script>

<template>
  <!-- One compact card above the log (design A); each group keeps its own heading. -->
  <div v-if="rows.length || rejected.length || notLive.length" class="divide-y rounded-xl border bg-card">
    <section v-if="rows.length" class="py-1.5" :aria-label="t('history.waiting')">
      <div class="flex items-center gap-2 px-4 pt-2 pb-1">
        <h2 class="text-sm font-semibold">{{ t('history.waiting') }}</h2>
        <Badge variant="warning" class="tabular-nums">{{ rows.length }}</Badge>
      </div>
      <ul class="m-0 list-none divide-y p-0">
        <li v-for="p in rows" :key="p.proposal" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
          <div class="min-w-0 flex-1">
            <p class="font-medium [overflow-wrap:anywhere] min-[900px]:text-sm">{{ line(p) }}</p>
            <p class="text-[13px] text-muted-foreground tabular-nums">{{ when(p.createdAt) }}</p>
          </div>
          <!-- ProposalWithdraw has no size prop and fixes its own height (44px); it is left as it is. -->
          <ProposalWithdraw :proposal="p.proposal" class="-mr-2" />
        </li>
      </ul>
    </section>
    <section v-if="rejected.length" class="py-1.5" :aria-label="t('history.notApproved')">
      <div class="flex items-center gap-2 px-4 pt-2 pb-1">
        <h2 class="text-sm font-semibold">{{ t('history.notApproved') }}</h2>
        <Badge variant="soft" class="tabular-nums">{{ rejected.length }}</Badge>
      </div>
      <ul class="m-0 list-none p-0">
        <li v-for="p in rejected" :key="p.proposal" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
          <div class="grid min-w-0 flex-1 gap-0.5">
            <p class="font-medium [overflow-wrap:anywhere] min-[900px]:text-sm">{{ line(p) }}</p>
            <p class="[overflow-wrap:anywhere] min-[900px]:text-sm">{{ rejectedText(p) }}</p>
            <p class="text-[13px] text-muted-foreground tabular-nums">{{ when(p.decidedAt ?? p.createdAt) }}</p>
          </div>
          <Button v-if="fixLink(p)" as-child variant="outline" size="sm"><NuxtLink :to="fixLink(p)">{{ t('history.fix') }}</NuxtLink></Button>
        </li>
      </ul>
    </section>
    <section v-if="notLive.length" class="py-1.5" :aria-label="t('history.notLive')">
      <div class="flex items-center gap-2 px-4 pt-2 pb-1">
        <h2 class="text-sm font-semibold">{{ t('history.notLive') }}</h2>
        <Badge variant="soft" class="tabular-nums">{{ notLive.length }}</Badge>
      </div>
      <ul class="m-0 list-none p-0">
        <li v-for="p in notLive" :key="p.proposal" class="grid gap-0.5 px-4 py-1.5">
          <p class="font-medium [overflow-wrap:anywhere] min-[900px]:text-sm">{{ line(p) }}</p>
          <p class="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">{{ notLiveText(p) }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>
