<!-- Heute (UI.md 3): one grid of area cards in schema order, every brick with tasks the person may do, each task button
     once; a plan brick sits in the card of the brick it plans. Above the grid, the verdict line and "Wartet auf dich"
     for what is not a task button. What the cards read and show is useTodayAreas; this page owns the sheets and the
     writes. Generic: nothing here knows the restaurant. -->
<script setup lang="ts">
import { provide } from 'vue'
import { resolveToken, weeklyTask, workWeekOf } from '@lupinum/ginko/internal'
import type { Entry } from '../../../composables/useSiteData'
import { useTodayAreas, type TodayFlag } from '../../../composables/useTodayAreas'
import { taskRef, titleOf, type Task } from '../../../utils/content'
import { shownLabel } from '../../../utils/labels'
import type { OwnRow } from '../../../utils/today'
import { whenFull } from '../../../utils/when'
import { useTextOf } from '../../../composables/useTextOf'
import { api } from '#convex/api'
import EntryRemoveDialog, { type EntryUses, type TrashOverflow } from '../../../components/EntryRemoveDialog.vue'
import TodayCard from '../../../components/today/TodayCard.vue'
import TodayVerdict from '../../../components/today/TodayVerdict.vue'
import TodayWaiting, { type Tile } from '../../../components/today/TodayWaiting.vue'
import { TODAY } from '../../../components/today/context'

definePageMeta({ layout: 'site' })

const { t, format, locale } = useI18n()
const s = await useSiteData()
useHead(() => ({ title: t('site.title.quick', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
const ops = useOps(s.slug)
const areas = useTodayAreas(s)
const { sections, cards, views, entriesOf, singleOf, plannedNow, ownRead, ownLine, ownWhen, fixTask, waiting, verdict, loadError } = areas

// An owner or admin without quick tasks has nothing to do here: Content is the place.
watchEffect(() => {
  if (s.schema.value && !sections.value.length && s.isManager.value) navigateTo(`/s/${s.slug.value}/all`, { replace: true })
})

// The open sheet: a task, and for edit tasks the entry; `reopen` is a rejected own proposal it starts from.
const open = ref<{ key: string; task: Task; entryId?: string; reopen?: string } | null>(null)
/** The open task's entry, live: the sheet sees changes others save meanwhile, and keeps it when someone removes it (N1). */
const openRead = useConvexQuery(api.entries.get, () => (open.value?.entryId ? { site: s.slug.value, entry: open.value.entryId } : 'skip'))
const { entry: openEntry, removed: openRemoved } = useKeptEntry(
  () => open.value?.entryId,
  () => { const e = openRead.data.value; return e && !e.deleted && e._id === open.value?.entryId ? e : undefined },
)
/** A create task points out a new entry that is already there (same title, still on the website). */
const twinRead = useConvexQuery(api.entries.titles, () => (open.value?.task.kind === 'create' && s.schema.value?.bricks[open.value.key]?.kind === 'collection' ? { site: s.slug.value, brick: open.value.key, language: locale.value } : 'skip'))
const existing = computed(() => {
  const brick = open.value ? s.schema.value?.bricks[open.value.key] : undefined
  if (!brick || !twinRead.data.value) return undefined
  return twinRead.data.value.filter((e) => e.until === undefined || e.until >= s.today.value).map((e) => e.title ?? shownLabel(brick.label, s.main.value))
})
/** A new planned week starts from the entry the website shows this week: the week planned for it, else the single when it is this week's. */
const copyFrom = computed(() => {
  const o = open.value
  const schema = s.schema.value
  const brick = o && schema ? schema.bricks[o.key] : undefined
  if (!o || o.task.kind !== 'create' || brick?.kind !== 'collection' || !brick.plans) return undefined
  const plan = plannedNow(brick.plans.brick)
  if (plan) return plan.entry._id
  const single = singleOf(brick.plans.brick)
  const weekly = weeklyTask(schema!.bricks[brick.plans.brick]!)
  return single && weekly && single.data[weekly.field] === workWeekOf(s.today.value, schema!.week) ? single._id : undefined
})
const picking = ref<{ key: string; task: Task } | null>(null)
// The pick list groups by a choice field and shows prices, so it reads the entries of its one brick while open: slim
// rows (titles, choices, prices), not whole entries; the sheet that edits the pick reads it whole.
const pickRead = useConvexQuery(api.entries.ofBricks, () => (picking.value ? { site: s.slug.value, bricks: [picking.value.key], slim: true } : 'skip'))

// Closing the sheets returns the focus to the button that started the task; the sheets are removed, so the browser has nowhere to put it back.
let launcher: HTMLElement | null = null
watch([open, picking], ([sheet, pick]) => {
  if (sheet || pick || !launcher) return
  const button = launcher
  launcher = null
  nextTick(() => { if (button.isConnected) button.focus() })
})

/**
 * "Nächste Woche planen" when that week is planned already: the person's edit task on that plan. A second plan for
 * the same week would never show (the server refuses it).
 */
function planOfWeek(key: string, task: Task): { task: Task; entry: Entry } | undefined {
  const schema = s.schema.value!
  const brick = schema.bricks[key]!
  if (task.kind !== 'create' || brick.kind !== 'collection' || !brick.plans) return undefined
  const token = task.prefill?.[brick.plans.field]
  const week = typeof token === 'string' ? resolveToken(token, schema.timeZone, schema.week) : undefined
  const edit = sections.value.find((x) => x.key === key)?.tasks.find((t) => t.kind === 'edit')
  const entry = week && entriesOf(key).find((e) => e.state !== 'draft' && e.data[brick.plans!.field] === week)
  return edit && entry ? { task: edit, entry } : undefined
}

/** Remembers what started a sheet: the given element (the "⋯" trigger of a menu item), else the focused one. */
function launchedFrom(el?: HTMLElement) {
  if (el) launcher = el
  else if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) launcher = document.activeElement
}

function start(key: string, task: Task, from?: HTMLElement) {
  launchedFrom(from)
  const brick = s.schema.value!.bricks[key]!
  const planned = planOfWeek(key, task)
  if (planned) {
    open.value = { key, task: planned.task, entryId: planned.entry._id }
    return
  }
  // "This week" while a planned week covers it: the same task edits that planned week (the one the website shows),
  // not the single's own fields, which would save without showing anywhere. The server allows it with this task.
  const plan = task.kind === 'edit' && brick.kind === 'single' ? plannedNow(key, task) : undefined
  if (plan) {
    open.value = { key, task, entryId: plan.entry._id }
    return
  }
  if (task.kind === 'remove' || (task.kind === 'edit' && brick.kind === 'collection')) {
    picking.value = { key, task }
    return
  }
  open.value = { key, task, entryId: task.kind === 'edit' ? singleOf(key)?._id : undefined }
}
/** "Korrigieren": the rejected proposal's task on its entry, starting from the proposal's values. */
function fix(key: string, p: OwnRow) {
  const task = fixTask(key, p)
  if (!task || !p.entry) return
  launchedFrom()
  open.value = { key, task, entryId: p.entry, reopen: p.proposal }
}
// "Korrigieren" in Verlauf and the rejection mail link here with ?task=<brick.task>&reopen=<proposal>: opened once,
// then the address drops it. A rejection that is no longer to fix (fixed, or changed since) opens nothing.
const route = useRoute()
let linked: string | undefined
watch([() => route.query.reopen, () => ownRead.data.value, () => s.schema.value], () => {
  // proposals.mine renders on the server: opening the sheet (focus, the address) belongs to the browser.
  if (import.meta.server) return
  const { task, reopen } = route.query
  if (typeof reopen !== 'string') linked = undefined
  if (typeof task !== 'string' || typeof reopen !== 'string' || reopen === linked || !ownRead.data.value || !s.schema.value) return
  linked = reopen
  const p = ownRead.data.value.rejected.find((r) => r.proposal === reopen && r.task === task && r.via === 'ui')
  if (p) fix(task.split('.')[0]!, p)
  navigateTo({ path: route.path, query: {} }, { replace: true })
}, { immediate: true })

function picked(entry: Entry) {
  const p = picking.value!
  picking.value = null
  if (p.task.kind === 'remove') return removeEntry(p.key, entry, p.task)
  open.value = { key: p.key, task: p.task, entryId: entry._id }
}

/** Entries whose removal is on its way, one per row: a row that finishes does not unlock another that still runs. */
const removing = reactive(new Set<string>())
const convex = useConvex()
/**
 * An entry other entries point at (N5), or one whose removal deletes older removed entries for good (a full trash): the
 * remove question with those lists. Other entries go at once, as before.
 */
const askRemove = ref<{ key: string; entry: Entry; task: Task; uses: EntryUses; overflow: TrashOverflow } | null>(null)
async function removeEntry(key: string, entry: Entry, task: Task) {
  removing.add(entry._id)
  try {
    // A failed lookup does not stop the removal: it only warns.
    const [uses, overflow] = await Promise.all([
      convex.query(api.entries.usedBy, { site: s.slug.value, entry: entry._id }).catch(() => []),
      convex.query(api.entries.trashOverflow, { site: s.slug.value, entry: entry._id }).catch(() => []),
    ])
    if (uses.length || overflow.length) askRemove.value = { key, entry, task, uses, overflow }
    else await removeNow(key, entry, task)
  } finally {
    removing.delete(entry._id)
  }
}
async function removeNow(key: string, entry: Entry, task: Task) {
  await ops.removeEntry(entry._id, entry.lifeRev, taskRef(key, task), titleOf(s.schema.value!.bricks[key]!, entry.data, s.main.value), entry.state === 'draft')
}
async function confirmRemove() {
  const ask = askRemove.value
  if (!ask) return
  removing.add(ask.entry._id)
  try {
    await removeNow(ask.key, ask.entry, ask.task)
    askRemove.value = null
  } finally {
    removing.delete(ask.entry._id)
  }
}

const lifting = ref(false)
async function lift(flag: TodayFlag, key: string) {
  if (flag.task.kind !== 'edit') return
  lifting.value = true
  try {
    const brick = s.schema.value!.bricks[key]!
    const fields = Object.fromEntries(flag.task.fields.filter((f) => brick.fields[f]?.optional).map((f) => [f, null]))
    // Aufheben ends what the website shows now ("Heute geschlossen"), so it goes online at once like the task did.
    await ops.saveEntry({ entry: flag.entry._id, baseRev: flag.entry.rev, fields, task: taskRef(key, flag.task), locale: s.main.value, op: ops.opId(), main: s.main.value, publish: true })
  } catch (e) {
    useToast().show((e as { message: string }).message, { tone: 'err' })
  } finally {
    lifting.value = false
  }
}

/** A listed entry opens in its edit task's sheet; the row gets the focus back. */
function openRow(key: string, task: Task, entryId: string) {
  launchedFrom()
  open.value = { key, task, entryId }
}

/** A "Fällig" link: scrolls to the area (a plan's own sub-section), focuses its heading and marks its card a moment. */
function focusArea(key: string) {
  const heading = document.getElementById(`b-${key}`)
  const card = heading?.closest<HTMLElement>('[data-card]')
  if (!heading || !card) return
  heading.closest('section')!.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  heading.focus({ preventScroll: true })
  card.dataset.flash = ''
  setTimeout(() => { delete card.dataset.flash }, 1500)
}
const labelOf = (key: string) => shownLabel(s.schema.value!.bricks[key]!.label, s.main.value)

// "Wartet auf dich" in words, one action per tile.
const textOf = useTextOf(() => ({ timeZone: s.schema.value?.timeZone ?? 'UTC', main: s.main.value }))
const history = computed(() => `/s/${s.slug.value}/history`)
const tiles = computed<Tile[]>(() => waiting.value.map((item): Tile => {
  switch (item.kind) {
    case 'rejected': return {
      id: `r-${item.p.proposal}`, kind: 'rejected', title: ownLine(item.p), sub: t('site.quick.rejected', { reason: item.p.reason ?? '' }), subWarn: true,
      action: item.fix ? { label: t('site.quick.fix'), primary: true, run: () => fix(item.key, item.p) } : { label: t('today.waiting.inHistory'), to: history.value },
    }
    case 'review': return { id: 'review', kind: 'review', title: t('site.quick.toReview', { count: item.count }), action: { label: t('nav.review'), to: `/s/${s.slug.value}/review` } }
    case 'unsaved': {
      const row = item.row
      const task = row.task
      return {
        // The time on its own line: in one string it broke the title in the middle of the date.
        id: `u-${row.key}`, kind: 'unsaved', title: row.label, sub: row.name !== row.area ? `${row.area} · ${row.time}` : row.time,
        action: { label: t('site.quick.drafts.continue'), to: row.to, run: task ? () => start(task.brick, task.task) : undefined },
      }
    }
    case 'notLive': return {
      id: `n-${item.p.proposal}`, kind: 'notLive', title: ownLine(item.p),
      sub: t('history.notLiveBecause', { when: whenFull(item.p.at!, s.schema.value?.timeZone ?? 'UTC', format), reason: textOf(item.p.reasonMsg, item.p.reason ?? '') }),
      action: { label: t('today.waiting.inHistory'), to: history.value },
    }
  }
}))

provide(TODAY, reactive({
  slug: s.slug, main: s.main, isManager: s.isManager, today: s.today, timeZone: computed(() => s.schema.value?.timeZone ?? 'UTC'),
  removing, lifting, entriesOf, isTimed: areas.isTimed,
  start, openRow, remove: removeEntry, lift, showExpired: areas.showExpired, expand: areas.expand,
}))
</script>

<template>
  <div class="@container w-full max-w-[1400px] px-4 pt-4 pb-10 min-[900px]:px-8 min-[900px]:pt-7 min-[900px]:pb-12">
    <header class="mb-4 grid gap-1 @[680px]:mb-5">
      <div class="flex flex-wrap items-baseline gap-x-3">
        <h1 class="text-[1.375rem] font-semibold tracking-tight">{{ t('nav.quick') }}</h1>
        <p v-if="s.today.value" class="text-[13px] text-muted-foreground">{{ format.date(s.today.value, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) }}</p>
      </div>
      <TodayVerdict v-if="sections.length" :verdict="verdict" :load-error="loadError" :label-of="labelOf" @area="focusArea" />
    </header>

    <TodayWaiting :tiles="tiles" />

    <p v-if="!sections.length && s.schema.value" class="rounded-xl border bg-card p-4 text-muted-foreground">{{ t('site.quick.nothingForYou') }}</p>
    <!-- A <div>, never a <section>: each card is the section that has its heading. -->
    <div v-else class="grid grid-cols-1 gap-3 @[680px]:grid-cols-2 @[680px]:gap-4 @[1060px]:grid-cols-3">
      <TodayCard v-for="card in cards" :key="card.key" :card="card" :views="views" :own-line="ownLine" :own-when="ownWhen" />
    </div>

    <!-- An edit task opens once its entry is here, so the form starts from the stored values. -->
    <TaskSheet
      v-if="open && s.schema.value && (!open.entryId || openEntry)"
      :site="s.slug.value"
      :brick-key="open.key"
      :brick="s.schema.value.bricks[open.key]!"
      :task="open.task"
      :entry="openEntry"
      :main="s.main.value"
      :locales="s.schema.value.locales"
      :schema="s.schema.value"
      :remove-task="sections.find((x) => x.key === open!.key)?.remove"
      :removed="openRemoved"
      :may-restore="s.isManager.value || !!sections.find((x) => x.key === open!.key)?.remove"
      :existing="existing"
      :copy-from="copyFrom"
      :reopen="open.reopen"
      :approval="!s.isManager.value && open.task.needsApproval === true"
      @close="open = null"
    />
    <EntryRemoveDialog
      v-if="askRemove && s.schema.value"
      :open="true" :slug="s.slug.value" :uses="askRemove.uses" :overflow="askRemove.overflow" :busy="removing.has(askRemove.entry._id)" :draft="askRemove.entry.state === 'draft'"
      :title="titleOf(s.schema.value.bricks[askRemove.key]!, askRemove.entry.data, s.main.value)"
      @update:open="askRemove = null" @confirm="confirmRemove"
    />
    <PickSheet
      v-if="picking && s.schema.value && pickRead.data.value"
      :brick="s.schema.value.bricks[picking.key]!"
      :task="picking.task"
      :entries="pickRead.data.value"
      :main="s.main.value"
      :today="s.today.value"
      @pick="picked"
      @close="picking = null"
    />
  </div>
</template>
