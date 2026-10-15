<!-- Schnell ändern (UI.md 3): every brick with tasks the person may do, in schema order, with a
     one-line state from the data and the task buttons. Generic: nothing here knows the restaurant. -->
<script setup lang="ts">
import type { Brick, CollectionBrick, Json } from '@lupinum/ginko'
import { visibleUntil, plannedWeeks, plansThisWeek, staleOf, weeklyTask, workWeekOf } from '@lupinum/ginko/internal'
import type { Entry } from '../../../composables/useSiteData'
import { textIn } from '@lupinum/ginko-editor'
import { displayValue, formatDay, taskRef, titleOf, type Task } from '../../../utils/content'
import { shownLabel } from '../../../utils/labels'
import { Button } from '@studio/components/ui/button'
import { api } from '#convex/api'
import EntryRemoveDialog, { type EntryUses, type TrashOverflow } from '../../../components/EntryRemoveDialog.vue'

definePageMeta({ layout: 'site' })

const { t, format, locale } = useI18n()
const s = await useSiteData()
useHead(() => ({ title: t('site.title.quick', { site: s.site.value?.name ?? t('site.fallback.site') }) }))
const ops = useOps(s.slug)

interface Section {
  key: string
  brick: Brick
  tasks: Task[]
  /** Tasks shown as buttons. */
  buttons: Task[]
  remove?: Task
  /** Time-limited collections list their entries with "Entfernen" (UI.md 3). */
  listed: Entry[]
}

/** A collection whose entries only show for a time: Schnell ändern lists them. */
const isTimed = (brick: Brick) => brick.kind === 'collection' && !!brick.visible && brick.visible.mode !== 'always'
/** The bricks with tasks this person may do, in schema order. */
const withTasks = computed(() => s.bricks.value.filter(([key, brick]) => (brick.tasks ?? []).some((t) => s.may(key, t))))
/**
 * The entries this page shows or reads its state from (small by design): the singles with tasks, the collections
 * that plan one of them ahead, and the timed collections with tasks. Nothing else of the site is read here.
 */
const shownBricks = computed(() => {
  const keys = new Set<string>()
  for (const [key, brick] of withTasks.value) {
    if (brick.kind === 'single') {
      keys.add(key)
      for (const [k, b] of s.bricks.value) if (b.kind === 'collection' && b.plans?.brick === key) keys.add(k)
    } else if (isTimed(brick)) keys.add(key)
  }
  return [...keys]
})
// Slim rows: collection entries carry only their titles and dates, so a timed collection near the site budget stays a
// small live answer; a sheet reads the entry it edits whole (openRead). Still read in the browser only: 2,000 entries
// with long text titles can pass the 1 MiB a server-rendered query may send.
const shownRead = useConvexQuery(api.entries.ofBricks, () => (shownBricks.value.length ? { site: s.slug.value, bricks: shownBricks.value, slim: true } : 'skip'), { server: false })
/** A collection's live entries in the site's order; a single's one entry. */
const entriesOf = (key: string): Entry[] => (shownRead.data.value ?? []).filter((e) => e.brick === key)
const singleOf = (key: string): Entry | undefined => entriesOf(key)[0]

const sections = computed<Section[]>(() => withTasks.value.map(([key, brick]) => {
  const tasks = (brick.tasks ?? []).filter((t) => s.may(key, t))
  const remove = tasks.find((t) => t.kind === 'remove')
  const timed = isTimed(brick)
  const listed = timed ? entriesOf(key) : []
  const buttons = tasks.filter((t) => t.kind !== 'remove' || !(timed && listed.length <= 10))
  return { key, brick, tasks, buttons, remove, listed }
}))

// An owner or admin without quick tasks has nothing to do here: Alles bearbeiten is the place.
watchEffect(() => {
  if (s.schema.value && !sections.value.length && s.isManager.value) navigateTo(`/s/${s.slug.value}/all`, { replace: true })
})

/**
 * What a tap on a listed entry opens: the edit task's sheet when the person has one, else the entry in
 * Alles bearbeiten when they may edit it there, else nothing (the row is plain text then).
 */
function rowTarget(sec: Section, entry: Entry): { task: Task } | { to: string } | undefined {
  const task = sec.tasks.find((t) => t.kind === 'edit')
  if (task) return { task }
  if (s.isManager.value) return { to: `/s/${s.slug.value}/all/${sec.key}/${entry._id}` }
  return undefined
}
/** The title and timing of a listed entry; a chevron marks the rows that open something. */
const rowClass = (opens: boolean) => ['grid min-w-0 flex-1 gap-0.5 bg-transparent p-0 text-left text-foreground no-underline', opens && 'cursor-pointer grid-cols-[1fr_auto] after:col-start-2 after:row-span-2 after:row-start-1 after:self-center after:px-1 after:text-xl after:text-muted-foreground after:content-["›"] [&>span]:col-start-1']
/** Rows a timed collection lists: those on the website now or later, and the expired ones behind a button. */
const LISTED = 50
/** Sections whose expired entries the person asked to see. */
const expiredShown = reactive(new Set<string>())
// What is on the website now or later comes first, at most LISTED (the area list has the rest); the expired entries
// follow only on request: the LISTED that ended last, in the list's order. A collection of 450 events stays a short
// page, and the area list is linked whenever a group is cut.
const listings = computed(() => Object.fromEntries(sections.value.map((sec) => {
  const rows = sec.listed.map((e) => ({ e, target: rowTarget(sec, e), dim: timing(sec.brick as CollectionBrick, e).dim }))
  const current = rows.filter((r) => !r.dim)
  const expired = rows.filter((r) => r.dim)
  const showExpired = expiredShown.has(sec.key)
  const endOf = (r: (typeof rows)[number]) => visibleUntil(sec.brick, r.e.data) ?? ''
  const latest = new Set(expired.toSorted((a, b) => endOf(b).localeCompare(endOf(a))).slice(0, LISTED))
  return [sec.key, {
    rows: [...current.slice(0, LISTED), ...(showExpired ? expired.filter((r) => latest.has(r)) : [])],
    more: current.length > LISTED || (showExpired && expired.length > LISTED),
    hiddenExpired: showExpired ? 0 : expired.length,
  }]
})))

/** "until 8.10." / the date range / "expired" for a timed entry. */
function timing(brick: CollectionBrick, entry: Entry): { text: string; dim: boolean } {
  const vis = brick.visible
  if (!vis || vis.mode === 'always') return { text: '', dim: false }
  const today = s.today.value
  const until = visibleUntil(brick, entry.data)
  if (!until) return { text: t('site.status.noEnd'), dim: false }
  const visible = until >= today
  if (brick.fields[vis.field]?.type === 'daterange') return { text: displayValue({ type: 'daterange', label: '' }, entry.data[vis.field], s.main.value, { t, format }), dim: !visible }
  return visible ? { text: until === today ? t('site.status.untilToday') : t('site.status.until', { date: formatDay(until, format) }), dim: false } : { text: t('site.status.expired'), dim: true }
}

/** A single's date field preset to @today shows "Heute: <task>" with Aufheben (UI.md 3). */
function todayFlag(key: string, brick: Brick, tasks: Task[]) {
  const entry = singleOf(key)
  if (!entry) return undefined
  for (const t of tasks) {
    if (t.kind !== 'edit' || !t.prefill) continue
    for (const [field, token] of Object.entries(t.prefill)) {
      if (token === '@today' && brick.fields[field]?.type === 'date' && entry.data[field] === s.today.value) return { task: t, entry }
    }
  }
  return undefined
}

/** The texts the person typed for a "today" task (e.g. the closing note), shown with its state. */
function flagTexts(brick: Brick, flag: { task: Task; entry: Entry }): string[] {
  if (flag.task.kind !== 'edit') return []
  return flag.task.fields.filter((f) => brick.fields[f]?.type === 'text').map((f) => textIn(flag.entry.data[f], s.main.value)).filter(Boolean)
}

/** A single's date field preset to @workWeek shows whether it is this week's (UI.md 3, weekly upkeep). The rule is `staleOf`, the same the reminder mail uses. */
/**
 * The entry planned ahead for this week of the single `key` (an entry of a collection that `plans` it). When there is
 * one, it is what the website shows this week, not the single's own fields (lunchWeekOn in the gastro preset).
 */
function plannedNow(key: string, task = weeklyTask(s.schema.value!.bricks[key]!)?.task) {
  const schema = s.schema.value!
  const start = workWeekOf(s.today.value, schema.week)
  if (!task) return undefined
  for (const [k, b] of Object.entries(schema.bricks)) {
    if (b.kind !== 'collection' || b.plans?.brick !== key) continue
    const entry = entriesOf(k).find((e) => e.state !== 'draft' && plansThisWeek(schema, key, task, k, e.data as Record<string, Json>, start))
    if (entry) return { key: k, entry, field: b.plans.field, start }
  }
  return undefined
}

function weekState(key: string, brick: Brick) {
  const entry = singleOf(key)
  if (!entry) return undefined
  const plan = plannedNow(key)
  if (plan) {
    const field = s.schema.value!.bricks[plan.key]!.fields[plan.field]
    return { current: true, text: t('site.quick.plannedWeek', { label: field ? shownLabel(field.label, s.main.value) : '', date: formatDay(plan.start, format) }) }
  }
  const state = staleOf(brick, entry.data, s.today.value, s.schema.value!.week, plannedWeeks(s.schema.value!, key, (k) => entriesOf(k).filter((e) => e.state !== 'draft').map((e) => ({ data: e.data as Record<string, Json> }))))
  if (!state) return undefined
  return { current: state.current, text: state.stored ? `${shownLabel(brick.fields[state.field]!.label, s.main.value)} ${formatDay(state.stored, format)}` : t('site.quick.notFilled') }
}

// The open sheet: a task, and for edit tasks the entry.
const open = ref<{ key: string; task: Task; entryId?: string } | null>(null)
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

function start(key: string, task: Task) {
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) launcher = document.activeElement
  const brick = s.schema.value!.bricks[key]!
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
  await ops.removeEntry(entry._id, entry.lifeRev, taskRef(key, task), titleOf(s.schema.value!.bricks[key]!, entry.data, s.main.value))
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
async function lift(flag: { task: Task; entry: Entry }, key: string) {
  if (flag.task.kind !== 'edit') return
  lifting.value = true
  try {
    const brick = s.schema.value!.bricks[key]!
    const fields = Object.fromEntries(flag.task.fields.filter((f) => brick.fields[f]?.optional).map((f) => [f, null]))
    await ops.saveEntry({ entry: flag.entry._id, baseRev: flag.entry.rev, fields, task: taskRef(key, flag.task), locale: s.main.value, op: ops.opId() })
  } catch (e) {
    useToast().show((e as { message: string }).message, { tone: 'err' })
  } finally {
    lifting.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-[760px] px-4 pt-4 min-[720px]:px-6 min-[720px]:pt-8">
    <header class="mb-6">
      <h1 class="text-xl font-semibold tracking-tight">{{ t('nav.quick') }}</h1>
      <p v-if="s.today.value" class="mt-0.5 text-[13px] text-muted-foreground">{{ format.date(s.today.value, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) }}</p>
    </header>
    <p v-if="!sections.length && s.schema.value" class="py-6 text-muted-foreground">{{ t('site.quick.nothingForYou') }}</p>

    <div class="grid gap-7">
    <section v-for="sec in sections" :key="sec.key" class="grid gap-3" :aria-labelledby="`b-${sec.key}`">
      <h2 :id="`b-${sec.key}`" class="text-[17px] font-semibold">{{ shownLabel(sec.brick.label, s.main.value) }}</h2>

      <template v-if="sec.brick.kind === 'single'">
        <div v-if="todayFlag(sec.key, sec.brick, sec.tasks)" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md px-3 py-2.5 bg-warning/10">
          <p>
            <I18nT k="site.quick.todayDone" :params="{ task: shownLabel(todayFlag(sec.key, sec.brick, sec.tasks)!.task.label, s.main.value) }"><template #task="{ text }"><strong>{{ text }}</strong></template></I18nT>
            <span v-for="text in flagTexts(sec.brick, todayFlag(sec.key, sec.brick, sec.tasks)!)" :key="text" class="mt-0.5 block">{{ t('site.quick.flagText', { text }) }}</span>
          </p>
          <Button type="button" variant="outline" size="sm" :disabled="lifting" @click="lift(todayFlag(sec.key, sec.brick, sec.tasks)!, sec.key)">{{ t('site.quick.clearToday') }}</Button>
        </div>
        <p v-if="weekState(sec.key, sec.brick)" :class="weekState(sec.key, sec.brick)!.current ? 'text-sm text-muted-foreground' : 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md px-3 py-2.5 bg-warning/10 font-semibold text-warning'">
          {{ weekState(sec.key, sec.brick)!.text }}<template v-if="!weekState(sec.key, sec.brick)!.current">{{ t('site.quick.notThisWeek') }}</template>
        </p>
      </template>

      <ul v-if="listings[sec.key]?.rows.length" class="m-0 list-none overflow-hidden rounded-xl border p-0">
        <li v-for="{ e, target } in listings[sec.key]!.rows" :key="e._id" class="group/row flex items-center gap-2 border-b px-4 py-3 last:border-b-0" :data-dim="timing(sec.brick as CollectionBrick, e).dim || undefined">
          <button v-if="target && 'task' in target" type="button" :class="rowClass(true)" @click="open = { key: sec.key, task: target.task, entryId: e._id }">
            <span class="font-medium group-data-dim/row:font-normal group-data-dim/row:text-muted-foreground">{{ titleOf(sec.brick, e.data, s.main.value) }}</span>
            <span class="text-[13px] text-muted-foreground">{{ timing(sec.brick as CollectionBrick, e).text }}</span>
          </button>
          <NuxtLink v-else-if="target" :to="target.to" :class="rowClass(true)">
            <span class="font-medium group-data-dim/row:font-normal group-data-dim/row:text-muted-foreground">{{ titleOf(sec.brick, e.data, s.main.value) }}</span>
            <span class="text-[13px] text-muted-foreground">{{ timing(sec.brick as CollectionBrick, e).text }}</span>
          </NuxtLink>
          <span v-else :class="rowClass(false)">
            <span class="font-medium group-data-dim/row:font-normal group-data-dim/row:text-muted-foreground">{{ titleOf(sec.brick, e.data, s.main.value) }}</span>
            <span class="text-[13px] text-muted-foreground">{{ timing(sec.brick as CollectionBrick, e).text }}</span>
          </span>
          <Button v-if="sec.remove" type="button" variant="ghost" size="sm" :disabled="removing.has(e._id)" :aria-label="t('site.quick.removeNamed', { title: titleOf(sec.brick, e.data, s.main.value) })" @click="removeEntry(sec.key, e, sec.remove)">{{ t('site.common.remove') }}</Button>
        </li>
      </ul>
      <p v-else-if="shownRead.data.value && isTimed(sec.brick)" class="text-muted-foreground">{{ t('site.quick.nothingNow') }}</p>
      <div v-if="listings[sec.key]?.more || listings[sec.key]?.hiddenExpired" class="flex flex-wrap items-center gap-3">
        <Button v-if="listings[sec.key]!.more" as-child variant="outline"><NuxtLink :to="`/s/${s.slug.value}/all/${sec.key}`">{{ t('site.quick.allIn', { brick: shownLabel(sec.brick.label, s.main.value) }) }}</NuxtLink></Button>
        <Button v-if="listings[sec.key]!.hiddenExpired" type="button" variant="outline" @click="expiredShown.add(sec.key)">{{ t('site.quick.showExpired', { count: listings[sec.key]!.hiddenExpired }) }}</Button>
      </div>

      <!-- Phone: the main task full width, the others in two columns; from sm they wrap in one row. Quick tasks are
           secondary (row D); only a task the week still needs (the menu is not set for this week) is filled. -->
      <div class="grid gap-2 sm:flex sm:flex-wrap">
        <Button v-if="sec.buttons[0]" type="button" :variant="weekState(sec.key, sec.brick)?.current === false ? 'default' : 'secondary'" class="w-full sm:w-auto" @click="start(sec.key, sec.buttons[0])">{{ shownLabel(sec.buttons[0].label, s.main.value) }}</Button>
        <div v-if="sec.buttons.length > 1" class="grid grid-cols-2 gap-2 sm:contents">
          <Button v-for="t in sec.buttons.slice(1)" :key="t.id" type="button" variant="secondary" class="max-sm:h-auto max-sm:min-h-10 max-sm:w-full max-sm:whitespace-normal max-sm:py-2" @click="start(sec.key, t)">{{ shownLabel(t.label, s.main.value) }}</Button>
        </div>
      </div>
    </section>
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
      @close="open = null"
    />
    <EntryRemoveDialog
      v-if="askRemove && s.schema.value"
      :open="true" :slug="s.slug.value" :uses="askRemove.uses" :overflow="askRemove.overflow" :busy="removing.has(askRemove.entry._id)"
      :title="titleOf(s.schema.value.bricks[askRemove.key]!, askRemove.entry.data, s.main.value)"
      @update:open="askRemove = null" @confirm="confirmRemove"
    />
    <PickSheet
      v-if="picking && s.schema.value && pickRead.data.value"
      :brick="s.schema.value.bricks[picking.key]!"
      :task="picking.task"
      :entries="pickRead.data.value"
      :main="s.main.value"
      @pick="picked"
      @close="picking = null"
    />
  </div>
</template>
