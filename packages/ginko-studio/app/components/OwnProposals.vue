<!-- "Waiting for approval" at the top of History (UI.md 10.4): the person's own open proposals, each
     with Withdraw; below, their proposals rejected in the last two weeks with the approver's sentence
     (UI.md 10.7 item 6: a rejection writes no change row). Nothing shows when there is neither. -->
<script setup lang="ts">
import { api } from '#convex/api'
import type { Schema } from '@lupinum/ginko'
import { opErrorOf } from '../composables/useOps'
import { useTextOf } from '../composables/useTextOf'
import { whoText } from '../utils/who'

const props = defineProps<{ site: string; schema: Schema; filter: 'all' | 'mine' | 'ai' | 'entry'; entry?: string }>()
const { t, format } = useI18n()
const { show } = useToast()

const list = useConvexQuery(api.proposals.list, () => ({ site: props.site, status: 'open' as const }))
const rejectedList = useConvexQuery(api.proposals.list, () => ({ site: props.site, status: 'rejected' as const }))
const withdrawMutation = useConvexMutation(api.proposals.withdraw)

// proposals.list gives approvers every open proposal: History shows the ones the person made.
type Row = NonNullable<typeof list.data.value>['page'][number]
const shownHere = (p: Row) => p.mine && (props.filter !== 'ai' || p.via === 'agent') && (props.filter !== 'entry' || p.entry === props.entry)
const rows = computed(() => (list.data.value?.page ?? []).filter(shownHere))
/** Long enough to be read after a weekend off; older rejections are only in the approver's history. */
const REJECTED_DAYS = 14
const rejected = computed(() => (rejectedList.data.value?.page ?? []).filter((p) => shownHere(p) && (p.decidedAt ?? 0) > Date.now() - REJECTED_DAYS * 86_400_000))

const textOf = useTextOf(() => ({ timeZone: props.schema.timezone, main: props.schema.locales[0] }))
const line = (p: Row) => textOf(p.msg, p.sentence)
const rejectedText = (p: Row) => t('history.rejectedBy', { who: p.decidedBy ? whoText(p.decidedBy, t) : t('who.member'), reason: textOf(p.reasonMsg, p.reason ?? '') })
const when = (at: number) => format.date(at, { timeZone: props.schema.timezone, day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const busy = ref<string | null>(null)
async function withdraw(proposal: string) {
  busy.value = proposal
  try {
    await withdrawMutation.mutate({ proposal })
    show(t('history.withdrawn'))
  } catch (e) {
    show(opErrorOf(e).message, { tone: 'err' })
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section v-if="rows.length" class="mb-4 grid gap-2" :aria-label="t('history.waiting')">
    <h2 class="text-[17px] font-semibold">{{ t('history.waiting') }}</h2>
    <ul class="m-0 list-none overflow-hidden rounded-xl border p-0">
      <li v-for="p in rows" :key="p.proposal" class="flex flex-wrap items-center gap-2 border-b px-4 py-3 last:border-b-0">
        <div class="min-w-0 flex-1">
          <p class="font-medium">{{ line(p) }}</p>
          <p class="text-[13px] text-muted-foreground">{{ when(p.createdAt) }}</p>
        </div>
        <Button type="button" variant="ghost" class="h-11" :disabled="busy === p.proposal" @click="withdraw(p.proposal)">{{ t('history.withdraw') }}</Button>
      </li>
    </ul>
  </section>
  <section v-if="rejected.length" class="mb-4 grid gap-2" :aria-label="t('history.notApproved')">
    <h2 class="text-[17px] font-semibold">{{ t('history.notApproved') }}</h2>
    <ul class="m-0 list-none overflow-hidden rounded-xl border p-0">
      <li v-for="p in rejected" :key="p.proposal" class="grid gap-0.5 border-b px-4 py-3 last:border-b-0">
        <p class="font-medium">{{ line(p) }}</p>
        <p class="[overflow-wrap:anywhere]">{{ rejectedText(p) }}</p>
        <p class="text-[13px] text-muted-foreground">{{ when(p.decidedAt ?? p.createdAt) }}</p>
      </li>
    </ul>
  </section>
</template>
