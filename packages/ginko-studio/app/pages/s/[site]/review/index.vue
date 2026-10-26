<!-- To review (UI.md 10.4): the open proposals of staff and agents, oldest first, for owners and admins.
     Proposals of a release are decided with the release (their section comes first). From 1100px the loose proposals
     are a list with the selected one beside it (the oldest by default, the next one after a decision); below, each row
     expands in place. Mail links open `#<proposal>`: selected or opened, or a note when it was decided meanwhile. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { opErrorOf } from '../../../../composables/useOps'
import { useTextOf } from '../../../../composables/useTextOf'
import { whenText } from '../../../../utils/when'
import { Button } from '@studio/components/ui/button'
import { Skeleton } from '@studio/components/ui/skeleton'
import { useMediaQuery, useMounted } from '@vueuse/core'
import StudioPage from '../../../../components/StudioPage.vue'

type HistoryMsg = { key: string; params?: Record<string, unknown> }

definePageMeta({ layout: 'site' })

const { t, format } = useI18n()
const s = await useSiteData()
useHead(() => ({ title: t('review.title', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
const { show } = useToast()
// Staff decide nothing: back to the quick edit.
if (!s.isManager.value) await navigateTo(`/s/${s.slug.value}`)

const PAGE = 50
const list = useConvexPaginatedQuery(api.proposals.list, () => (s.isManager.value ? { site: s.slug.value, status: 'open' as const, order: 'oldest' as const } : 'skip'), { initialNumItems: PAGE })
const releaseList = useConvexQuery(api.proposals.releases, () => (s.isManager.value ? { site: s.slug.value } : 'skip'))
const approveRelease = useConvexMutation(api.proposals.approveRelease)
const removeFromRelease = useConvexMutation(api.proposals.removeFromRelease)

// The server lists the oldest first (`order: 'oldest'`). Members of a release come with the release, whichever pages are loaded.
const loose = computed(() => (list.data.value ?? []).filter((p) => !p.release))
// The server sends only releases still to decide (open or stale).
const releases = computed(() => releaseList.data.value ?? [])
const shownIds = computed(() => new Set([...loose.value, ...releases.value.flatMap((r) => r.proposals)].map((p) => p.proposal as string)))

// Wide: one selected proposal beside the list. When it leaves the list (decided here or elsewhere), the one that took
// its place is selected: the next one in the queue, or the new last one.
// Only after mounting: the server renders the narrow form, and hydration must see the same.
const mounted = useMounted()
const wideScreen = useMediaQuery('(min-width: 1100px)')
const wide = computed(() => mounted.value && wideScreen.value)
const selectedId = ref<string>()
const at = ref(0)
const selected = computed(() => loose.value.find((p) => p.proposal === selectedId.value) ?? loose.value[Math.min(at.value, loose.value.length - 1)])
// Also when the list changes around it (one above it is decided elsewhere): the index must stay the selection's place,
// or the next decision would skip one.
watch([selected, loose], ([p, rows]) => {
  if (!p) return
  const left = !!selectedId.value && selectedId.value !== p.proposal && !rows.some((r) => r.proposal === selectedId.value)
  selectedId.value = p.proposal
  at.value = rows.indexOf(p)
  // The decided one's pane went with the focus in it: the next one's heading takes it, so a keyboard keeps working
  // through the queue instead of starting again at the top of the page.
  if (left && wide.value) void nextTick(() => { if (document.activeElement === document.body) document.getElementById('review-detail-title')?.focus() })
})

// Narrow, and the members of releases: rows that expand in place, several at once.
const openIds = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(openIds.value)
  if (!next.delete(id)) next.add(id)
  openIds.value = next
}

// Browser only, like every reader of the count: a server read reaches the layout's rail badge while it hydrates.
const waiting = useConvexQuery(api.proposals.count, () => (s.isManager.value ? { site: s.slug.value } : 'skip'), { server: false })
const lede = computed(() => {
  // No count to wait for when the query failed or fails to start: then no lede, not a skeleton.
  if (waiting.error.value || list.error.value || !s.isManager.value) return ''
  const n = waiting.data.value
  if (n === undefined || list.data.value === undefined || releaseList.data.value === undefined) return undefined
  // A release to decide is listed although no single change waits: no "nothing waits" over it.
  if (n === 0 && releases.value.length) return ''
  return n === 0 ? t('review.empty') : n === 1 ? t('review.countOne') : t('review.countMany', { count: n })
})

/** A mail link to a proposal that is no longer open: everything is loaded and it is not there. */
const gone = ref(false)
onMounted(() => {
  const id = useRoute().hash.slice(1)
  if (!id) return
  openIds.value = new Set([id])
  selectedId.value = id
  // Once found, it stays found: the owner deciding it here removes it from the list, which is not "decided meanwhile".
  let seen = false
  watch(
    () => [shownIds.value.has(id), list.isExhausted.value && releaseList.data.value !== undefined] as const,
    ([found, loaded]) => {
      if (found) seen = true
      gone.value = !seen && loaded
      if (found) nextTick(() => document.getElementById(id)?.scrollIntoView({ block: 'nearest' }))
    },
    { immediate: true },
  )
})

/** A release member that is no longer open, in the Studio's language. */
const textOf = useTextOf(() => ({ timeZone: s.schema.value!.timeZone, main: s.schema.value!.locales[0] }))
const lineOf = (m: { sentence: string; msg: HistoryMsg | null }) => textOf(m.msg, m.sentence)
/** A stale reason in the Studio's language; the German text when the server sent no message. */
const reasonOf = (m: { reason?: string | null; reasonMsg?: HistoryMsg | null }) => textOf(m.reasonMsg, m.reason ?? '')

const blocked = ref<Record<string, { proposal: string; sentence: string; reason: string; reasonMsg?: HistoryMsg | null }[]>>({})
const problem = ref('')

async function approveAll(release: string) {
  problem.value = ''
  try {
    const result = await approveRelease.mutate({ release }) as { status: string; at?: number; stale?: { proposal: string; sentence: string; reason: string; reasonMsg?: HistoryMsg | null }[] }
    if (result.status === 'stale') blocked.value = { ...blocked.value, [release]: result.stale ?? [] }
    else show(result.status === 'scheduled' && result.at !== undefined ? t('ops.scheduled', { time: whenText(result.at, s.schema.value!.timeZone, format) }) : t('review.releaseApproved'))
  } catch (e) {
    const error = opErrorOf(e)
    // A late failure comes with the list of members that no longer fit.
    const stale = (error.details as { stale?: { proposal: string; sentence: string; reason: string; reasonMsg?: HistoryMsg | null }[] } | undefined)?.stale
    if (stale) blocked.value = { ...blocked.value, [release]: stale }
    else problem.value = error.message
  }
}

async function remove(release: string, proposal: string) {
  problem.value = ''
  try {
    await removeFromRelease.mutate({ release, proposal })
    blocked.value = { ...blocked.value, [release]: (blocked.value[release] ?? []).filter((x) => x.proposal !== proposal) }
  } catch (e) {
    problem.value = opErrorOf(e).message
  }
}
</script>

<template>
  <StudioPage :title="t('review.heading')">
    <template #lede>
      <template v-if="lede !== undefined">{{ lede }}</template>
      <Skeleton v-else class="mt-1.5 h-4 w-44" />
    </template>
    <div class="grid gap-6">
      <SiteZoneNote v-if="s.schema.value" :zone="s.schema.value.timeZone" class="-mt-4" />
      <p v-if="list.error.value" class="font-medium text-destructive" role="alert">{{ opErrorOf(list.error.value, t('basics.loadFailed')).message }}</p>
      <p v-if="problem" class="font-medium text-destructive" role="alert">{{ problem }}</p>
      <p v-if="gone" class="max-w-[65ch] rounded-lg bg-muted/50 px-4 py-3 text-sm" role="status">{{ t('review.gone') }}</p>

      <template v-if="s.schema.value">
        <section v-if="releases.length" class="grid gap-3" :aria-label="t('review.releases')">
          <h2 class="text-base font-semibold">{{ t('review.releases') }}</h2>
          <div v-for="r in releases" :key="r.release" class="overflow-hidden rounded-xl border bg-card">
            <div class="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <h3 class="min-w-0 flex-1 text-sm font-semibold">{{ r.name }}<span v-if="r.at" class="text-[13px] font-normal text-muted-foreground"> · {{ t('review.plannedAt', { time: whenText(r.at, s.schema.value.timeZone, format) }) }}</span></h3>
              <Button type="button" size="sm" :disabled="approveRelease.pending.value" @click="approveAll(r.release)">{{ t('review.approveRelease') }}</Button>
            </div>
            <div v-if="blocked[r.release]?.length" class="grid gap-1 border-b bg-warning/12 px-4 py-3" role="alert">
              <p class="font-medium">{{ t('review.releaseBlocked') }}</p>
              <p v-for="x in blocked[r.release]" :key="x.proposal" class="flex flex-wrap items-center gap-2 text-[13px]">
                <span class="min-w-0 flex-1">{{ x.sentence }} · {{ reasonOf(x) }}</span>
                <Button type="button" variant="outline" size="sm" @click="remove(r.release, x.proposal)">{{ t('review.removeFromRelease') }}</Button>
              </p>
            </div>
            <ul class="m-0 list-none divide-y p-0">
              <template v-for="m in r.proposals" :key="m.proposal">
                <ReviewItem
                  v-if="m.status === 'open'"
                  :site="s.slug.value" :schema="s.schema.value" :proposal="m" in-release
                  :open="openIds.has(m.proposal)" @toggle="toggle(m.proposal)"
                />
                <li v-else class="flex flex-wrap items-center gap-2 px-4 py-3 text-[13px] text-muted-foreground">
                  <span class="min-w-0 flex-1">{{ lineOf(m) }}<template v-if="m.reason"> · {{ reasonOf(m) }}</template></span>
                  <Button v-if="m.status === 'stale'" type="button" variant="outline" size="sm" @click="remove(r.release, m.proposal)">{{ t('review.removeFromRelease') }}</Button>
                </li>
              </template>
            </ul>
          </div>
        </section>

        <!-- The queue: beside the selected proposal on wide screens, rows that expand below. -->
        <div v-if="loose.length" :class="wide && 'grid grid-cols-[minmax(0,380px)_minmax(0,1fr)] items-start gap-6'">
          <div class="grid gap-3">
            <ul class="m-0 list-none divide-y overflow-hidden rounded-xl border bg-card p-0" :aria-label="t('review.queue')">
              <ReviewItem
                v-for="p in loose" :key="p.proposal"
                :site="s.slug.value" :schema="s.schema.value" :proposal="p"
                :variant="wide ? 'select' : 'row'"
                :open="wide ? selected?.proposal === p.proposal : openIds.has(p.proposal)"
                @toggle="wide ? (selectedId = p.proposal) : toggle(p.proposal)"
              />
            </ul>
            <Button v-if="list.canLoadMore.value || list.isLoadingMore.value" type="button" variant="outline" class="justify-self-start" :disabled="!list.canLoadMore.value" @click="list.loadMore(PAGE)">{{ t('basics.loadMore') }}</Button>
          </div>
          <ReviewItem
            v-if="wide && selected" :key="selected.proposal"
            :site="s.slug.value" :schema="s.schema.value" :proposal="selected" variant="pane" open
          />
        </div>
        <p v-else-if="list.isExhausted.value && !releases.length" class="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground min-[900px]:text-sm text-balance">{{ t('review.emptyHint') }}</p>
        <div v-else-if="list.data.value === undefined && !list.error.value" class="divide-y overflow-hidden rounded-xl border bg-card" :class="wide && 'max-w-[380px]'" aria-hidden="true">
          <div v-for="n in 3" :key="n" class="grid gap-2 px-4 py-4">
            <Skeleton class="h-4 w-3/4" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </div>
      </template>
    </div>
  </StudioPage>
</template>
