<!-- Schnell ändern (UI.md 3): every brick with tasks the person may do, in schema order, with a
     one-line state from the data and the task buttons. Generic: nothing here knows the restaurant. -->
<script setup lang="ts">
import type { Brick, CollectionBrick, Json } from '@lupinum/ginko'
import { addDays, isVisible, weekOfSchema, plannedWeeks, plansThisWeek, staleOf, weeklyTask, workWeekOf } from '@lupinum/ginko/internal'
import type { Entry } from '../../../composables/useSiteData'
import { textIn } from '@lupinum/ginko-editor'
import { displayValue, formatDay, taskRef, titleOf, type Task } from '../../../utils/content'
import { shownLabel } from '../../../utils/labels'
import { Button } from '@studio/components/ui/button'

definePageMeta({ layout: 'site', convexAuth: true })

const { t, format } = useI18n()
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

const sections = computed<Section[]>(() => s.bricks.value.flatMap(([key, brick]) => {
  const tasks = (brick.tasks ?? []).filter((t) => s.may(key, t))
  if (!tasks.length) return []
  const remove = tasks.find((t) => t.kind === 'remove')
  const timed = brick.kind === 'collection' && !!brick.visible && brick.visible.mode !== 'always'
  const listed = timed ? s.entriesOf(key) : []
  const buttons = tasks.filter((t) => t.kind !== 'remove' || !(timed && listed.length <= 10))
  return [{ key, brick, tasks, buttons, remove, listed }]
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
// What is on the website now comes first; expired and upcoming entries follow (stable order within each group).
const rowsOf = (sec: Section) => [...sec.listed]
  .sort((a, b) => Number(timing(sec.brick as CollectionBrick, a).dim) - Number(timing(sec.brick as CollectionBrick, b).dim))
  .map((e) => ({ e, target: rowTarget(sec, e) }))

/** "until 8.10." / "from 16.10." / "expired" for a timed entry. */
function timing(brick: CollectionBrick, entry: Entry): { text: string; dim: boolean } {
  const vis = brick.visible
  if (!vis || vis.mode === 'always') return { text: '', dim: false }
  const value = entry.data[vis.field]
  const today = s.today.value
  const visible = isVisible(brick, entry.data, today)
  if (vis.mode === 'active') {
    const until = typeof value === 'string' ? addDays(value, vis.days ?? 0) : undefined
    if (!until) return { text: t('site.status.noEnd'), dim: false }
    return visible ? { text: until === today ? t('site.status.untilToday') : t('site.status.until', { date: formatDay(until, format) }), dim: false } : { text: t('site.status.expired'), dim: true }
  }
  const range = value as { from: string; to: string } | undefined
  if (!range) return { text: '', dim: false }
  return { text: displayValue({ type: 'daterange', label: '' }, range, s.main.value, { t, format }), dim: !visible }
}

/** A single's date field preset to @today shows "Heute: <task>" with Aufheben (UI.md 3). */
function todayFlag(key: string, brick: Brick, tasks: Task[]) {
  const entry = s.single(key)
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

/** A single's date field preset to @thisWeek shows whether it is this week's (UI.md 3, weekly upkeep). The rule is `staleOf`, the same the reminder mail uses. */
/**
 * The entry planned ahead for this week of the single `key` (an entry of a collection that `plans` it). When there is
 * one, it is what the website shows this week, not the single's own fields (lunchWeekOn in the gastro preset).
 */
function plannedNow(key: string, task = weeklyTask(s.schema.value!.bricks[key]!)?.task) {
  const schema = s.schema.value!
  const start = workWeekOf(s.today.value, weekOfSchema(schema))
  if (!task) return undefined
  for (const [k, b] of Object.entries(schema.bricks)) {
    if (b.kind !== 'collection' || b.plans?.brick !== key) continue
    const entry = s.entriesOf(k).find((e) => e.state !== 'draft' && plansThisWeek(schema, key, task, k, e.data as Record<string, Json>, start))
    if (entry) return { key: k, entry, field: b.plans.field, start }
  }
  return undefined
}

function weekState(key: string, brick: Brick) {
  const entry = s.single(key)
  if (!entry) return undefined
  const plan = plannedNow(key)
  if (plan) {
    const field = s.schema.value!.bricks[plan.key]!.fields[plan.field]
    return { current: true, text: t('site.quick.plannedWeek', { label: field ? shownLabel(field.label, s.main.value) : '', date: formatDay(plan.start, format) }) }
  }
  const state = staleOf(brick, entry.data, s.today.value, weekOfSchema(s.schema.value!), plannedWeeks(s.schema.value!, key, (k) => s.entriesOf(k).filter((e) => e.state !== 'draft').map((e) => ({ data: e.data as Record<string, Json> }))))
  if (!state) return undefined
  return { current: state.current, text: state.stored ? `${shownLabel(brick.fields[state.field]!.label, s.main.value)} ${formatDay(state.stored, format)}` : t('site.quick.notFilled') }
}

// The open sheet: a task, and for edit tasks the entry.
const open = ref<{ key: string; task: Task; entryId?: string } | null>(null)
/** The open task's entry, live: the sheet sees changes others save meanwhile. */
const openEntry = computed(() => (open.value?.entryId ? s.entries.value.find((e) => e._id === open.value!.entryId) : undefined))
const picking = ref<{ key: string; task: Task } | null>(null)

function start(key: string, task: Task) {
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
  open.value = { key, task, entryId: task.kind === 'edit' ? s.single(key)?._id : undefined }
}
function picked(entry: Entry) {
  const p = picking.value!
  picking.value = null
  if (p.task.kind === 'remove') return removeEntry(p.key, entry, p.task)
  open.value = { key: p.key, task: p.task, entryId: entry._id }
}

const removing = ref<string | null>(null)
async function removeEntry(key: string, entry: Entry, task: Task) {
  removing.value = entry._id
  try {
    await ops.removeEntry(entry._id, entry.lifeRev, taskRef(key, task), titleOf(s.schema.value!.bricks[key]!, entry.data, s.main.value))
  } finally {
    removing.value = null
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
  <main class="w-full max-w-[760px] px-4 pt-4 pb-30 min-[720px]:px-6 min-[720px]:pt-8">
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
            <T k="site.quick.todayDone" :params="{ task: shownLabel(todayFlag(sec.key, sec.brick, sec.tasks)!.task.label, s.main.value) }"><template #task="{ text }"><strong>{{ text }}</strong></template></T>
            <span v-for="text in flagTexts(sec.brick, todayFlag(sec.key, sec.brick, sec.tasks)!)" :key="text" class="mt-0.5 block">{{ t('site.quick.flagText', { text }) }}</span>
          </p>
          <Button type="button" variant="outline" size="sm" :disabled="lifting" @click="lift(todayFlag(sec.key, sec.brick, sec.tasks)!, sec.key)">{{ t('site.quick.clearToday') }}</Button>
        </div>
        <p v-if="weekState(sec.key, sec.brick)" :class="weekState(sec.key, sec.brick)!.current ? 'text-sm text-muted-foreground' : 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md px-3 py-2.5 bg-warning/10 font-semibold text-warning'">
          {{ weekState(sec.key, sec.brick)!.text }}<template v-if="!weekState(sec.key, sec.brick)!.current">{{ t('site.quick.notThisWeek') }}</template>
        </p>
      </template>

      <ul v-if="sec.listed.length" class="m-0 list-none overflow-hidden rounded-xl border p-0">
        <li v-for="{ e, target } in rowsOf(sec)" :key="e._id" class="group/row flex items-center gap-2 border-b px-4 py-3 last:border-b-0" :data-dim="timing(sec.brick as CollectionBrick, e).dim || undefined">
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
          <Button v-if="sec.remove" type="button" variant="ghost" size="sm" :disabled="removing === e._id" :aria-label="t('site.quick.removeNamed', { title: titleOf(sec.brick, e.data, s.main.value) })" @click="removeEntry(sec.key, e, sec.remove)">{{ t('site.common.remove') }}</Button>
        </li>
      </ul>
      <p v-else-if="sec.brick.kind === 'collection' && sec.brick.visible && sec.brick.visible.mode !== 'always'" class="text-muted-foreground">{{ t('site.quick.nothingNow') }}</p>

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

    <TaskSheet
      v-if="open && s.schema.value"
      :site="s.slug.value"
      :brick-key="open.key"
      :brick="s.schema.value.bricks[open.key]!"
      :task="open.task"
      :entry="openEntry"
      :main="s.main.value"
      :locales="s.schema.value.locales"
      :schema="s.schema.value"
      :entries="s.entries.value"
      :remove-task="sections.find((x) => x.key === open!.key)?.remove"
      :existing="s.schema.value.bricks[open.key]!.kind === 'collection' ? s.entriesOf(open.key).filter((e) => isVisible(s.schema.value!.bricks[open!.key]!, e.data, s.today.value)) : undefined"
      @close="open = null"
    />
    <PickSheet
      v-if="picking && s.schema.value"
      :brick="s.schema.value.bricks[picking.key]!"
      :task="picking.task"
      :entries="s.entriesOf(picking.key)"
      :main="s.main.value"
      @pick="picked"
      @close="picking = null"
    />
  </main>
</template>
