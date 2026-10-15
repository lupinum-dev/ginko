<!-- To review (UI.md 10.4): the open proposals of staff and agents, oldest first, for owners and admins.
     Proposals of a release are decided with the release. Mail links open `#<proposal>` with that row open. -->
<script setup lang="ts">
import { api } from '#convex/api'
import { opErrorOf } from '../../../../composables/useOps'
import { useTextOf } from '../../../../composables/useTextOf'
import { whenText } from '../../../../utils/when'
import { Button } from '@studio/components/ui/button'

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

const openIds = ref(new Set<string>())
function toggle(id: string) {
  const next = new Set(openIds.value)
  if (!next.delete(id)) next.add(id)
  openIds.value = next
}
onMounted(() => {
  const id = useRoute().hash.slice(1)
  if (!id) return
  openIds.value = new Set([id])
  watch(() => shownIds.value.has(id), (found) => { if (found) nextTick(() => document.getElementById(id)?.scrollIntoView()) }, { immediate: true })
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
  <div class="w-full max-w-[760px] px-4 pt-4 pb-30 min-[720px]:px-6 min-[720px]:pt-8 grid gap-4">
    <h1 class="text-xl font-semibold tracking-tight">{{ t('review.heading') }}</h1>
    <SiteZoneNote v-if="s.schema.value" :zone="s.schema.value.timeZone" class="-mt-2" />
    <p v-if="list.error.value" class="font-medium text-destructive" role="alert">{{ opErrorOf(list.error.value).message }}</p>
    <p v-if="problem" class="font-medium text-destructive" role="alert">{{ problem }}</p>

    <template v-if="s.schema.value">
      <ul v-if="loose.length" class="m-0 list-none overflow-hidden rounded-xl border p-0">
        <ReviewItem
          v-for="p in loose" :key="p.proposal"
          :site="s.slug.value" :schema="s.schema.value" :proposal="p"
          :open="openIds.has(p.proposal)" @toggle="toggle(p.proposal)"
        />
      </ul>
      <p v-else-if="list.isExhausted.value && !releases.length" class="py-6 text-muted-foreground">{{ t('review.empty') }}</p>
      <Button v-if="list.canLoadMore.value || list.isLoadingMore.value" type="button" variant="secondary" class="justify-self-start" :disabled="!list.canLoadMore.value" @click="list.loadMore(PAGE)">{{ t('files.loadMore') }}</Button>

      <section v-if="releases.length" class="grid gap-3" :aria-label="t('review.releases')">
        <h2 class="text-base font-semibold tracking-tight">{{ t('review.releases') }}</h2>
        <div v-for="r in releases" :key="r.release" class="overflow-hidden rounded-xl border">
          <div class="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <h3 class="min-w-0 flex-1 font-medium">{{ r.name }}<span v-if="r.at" class="text-[13px] font-normal text-muted-foreground"> · {{ t('review.plannedAt', { time: whenText(r.at, s.schema.value.timeZone, format) }) }}</span></h3>
            <Button type="button" size="sm" :disabled="approveRelease.pending.value" @click="approveAll(r.release)">{{ t('review.approveRelease') }}</Button>
          </div>
          <div v-if="blocked[r.release]?.length" class="grid gap-1 border-b bg-warning/12 px-4 py-3" role="alert">
            <p class="font-medium">{{ t('review.releaseBlocked') }}</p>
            <p v-for="x in blocked[r.release]" :key="x.proposal" class="flex flex-wrap items-center gap-2 text-[13px]">
              <span class="min-w-0 flex-1">{{ x.sentence }} · {{ reasonOf(x) }}</span>
              <Button type="button" variant="secondary" size="sm" @click="remove(r.release, x.proposal)">{{ t('review.removeFromRelease') }}</Button>
            </p>
          </div>
          <ul class="m-0 list-none p-0">
            <template v-for="m in r.proposals" :key="m.proposal">
              <ReviewItem
                v-if="m.status === 'open'"
                :site="s.slug.value" :schema="s.schema.value" :proposal="m" in-release
                :open="openIds.has(m.proposal)" @toggle="toggle(m.proposal)"
              />
              <li v-else class="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-[13px] text-muted-foreground last:border-b-0">
                <span class="min-w-0 flex-1">{{ lineOf(m) }}<template v-if="m.reason"> · {{ reasonOf(m) }}</template></span>
                <Button v-if="m.status === 'stale'" type="button" variant="secondary" size="sm" @click="remove(r.release, m.proposal)">{{ t('review.removeFromRelease') }}</Button>
              </li>
            </template>
          </ul>
        </div>
      </section>
    </template>
  </div>
</template>
