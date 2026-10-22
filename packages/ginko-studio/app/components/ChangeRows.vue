<!-- The change log (UI.md 7), one paginated query: older pages load on demand and every loaded page
     stays live, so an undo on an older page updates its row at once. Rückgängig shows only on saves that are not undone yet, and for
     staff only when one of their granted edit tasks covers every field of the change, or when the change is of an entry
     they created (`own`) and they still hold its create task (SPEC 2.7); undo only with such a task without approval
     (with approval, going back to a version becomes a proposal instead). An approved change names the approver. A save the
     server would refuse to undo (`undoBlocked`: saved again, removed, fields restructured) says why
     instead. "Zurück zu dieser Version" shows what it changes before it saves.
     Layout (design A): days (Today, Yesterday, dates), each a card whose rows share columns (time, what and who, then fixed
     action slots); from 1280px "Show changes" opens the diff in a sticky right column so the list keeps its place, below it
     opens in the row. The revert question always stays in its row. The default slot sits above the log (OwnProposals). -->
<script setup lang="ts">
import { nextTick } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { EllipsisIcon, XIcon } from '@lucide/vue'
import { api } from '#convex/api'
import { labelOf, type Schema } from '@lupinum/ginko/internal'
import { opErrorOf } from '../composables/useOps'
import { useTextOf } from '../composables/useTextOf'
import { byText, whoText } from '../utils/who'
import { msToZoned, whenClock, whenFull } from '../utils/when'
import { Badge } from '@studio/components/ui/badge'
import { Button } from '@studio/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@studio/components/ui/dropdown-menu'
import { Skeleton } from '@studio/components/ui/skeleton'

const props = defineProps<{
  site: string
  schema: Schema
  manager: boolean
  grants: ReadonlySet<string>
  /** History filter (UI.md 10.5): `entry` is the list of that entry (see `entry`). */
  filter?: 'all' | 'mine' | 'ai' | 'entry'
  entry?: string
}>()
defineSlots<{ default?(): unknown }>()
const { t, format, locale } = useI18n()

const PAGE = 50
const by = (): 'me' | 'ai' | undefined => (props.filter === 'mine' ? 'me' : props.filter === 'ai' ? 'ai' : undefined)
// A new filter starts the list again by itself. Server rendering may start with a split first page; the list is then
// idle until the browser takes over, so the empty text waits for status 'success' (skeleton rows until then).
const list = useConvexPaginatedQuery(api.changes.list, () => ({ site: props.site, entry: props.filter === 'entry' ? props.entry : undefined, by: by() }), { initialNumItems: PAGE })
const ops = useOps(computed(() => props.site))

type Change = NonNullable<typeof list.data.value>[number]

const rows = computed<readonly Change[]>(() => list.data.value ?? [])
const loading = computed(() => !rows.value.length && list.status.value !== 'success' && !list.error.value)
// The detail column stays while a new filter or the first page loads, so the list keeps its width when rows arrive.
const asideShown = computed(() => wide.value && (rows.value.length > 0 || loading.value))

// Ticks so "Today" turns into "Yesterday" while the page stays open.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 60_000) })
onUnmounted(() => clearInterval(timer))

const zone = () => props.schema.timeZone
const fullDate = (at: number) => whenFull(at, zone(), format)
const clock = (at: number) => whenClock(at, zone(), format)

/** The rows by day in the site's time zone (newest first, as the server sends them): Today, Yesterday, then dates. */
const days = computed(() => {
  const today = msToZoned(now.value, zone()).slice(0, 10)
  const [y, m, d] = today.split('-').map(Number)
  const yesterday = new Date(Date.UTC(y!, m! - 1, d! - 1)).toISOString().slice(0, 10)
  const groups: { key: string; label: string; rows: Change[] }[] = []
  for (const change of rows.value) {
    const key = msToZoned(change.at, zone()).slice(0, 10)
    let group = groups.at(-1)
    if (group?.key !== key) {
      const label = key === today ? t('history.today') : key === yesterday ? t('history.yesterday')
        : format.date(change.at, { timeZone: zone(), weekday: 'long', day: 'numeric', month: 'long', ...(key.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }) })
      group = { key, label, rows: [] }
      groups.push(group)
    }
    group.rows.push(change)
  }
  return groups
})

/** The line in the Studio's language, dates in the site's zone; rows from before `msg` show their German sentence. */
const textOf = useTextOf(() => ({ timeZone: props.schema.timeZone, main: props.schema.locales[0] }))
const sentenceOf = (change: Change) => textOf(change.msg, change.sentence)

/** Who made the change, and the AI key when one did. */
const actorName = (change: Change) => byText(change.who, change.via, change.agent, t)
const whoLine = (change: Change) => (change.approver ? `${actorName(change)} · ${t('history.approval', { who: whoText(change.approver, t) })}` : actorName(change))
/** The area of the change, as a chip; left out in the history of one entry, where it is always the same. */
const areaOf = (change: Change) => (props.filter !== 'entry' && Object.hasOwn(props.schema.bricks, change.brick) ? labelOf(props.schema.bricks[change.brick]!.label, locale.value, props.schema.locales[0]!) : undefined)

/**
 * The task a staff member needs to go back on this save: one granted edit task that covers all its fields, else, for an
 * entry they created, their create task of the brick (lib/access.ts `authorize`, the agent door's `taskFor`). `direct`
 * asks for one without approval (undo writes at once, which the server refuses on such a task). Owners and admins need none.
 */
function taskFor(change: Change, direct = false): string | undefined {
  if (props.manager) return undefined
  const fields = change.fields ?? []
  const held = (props.schema.bricks[change.brick]?.tasks ?? [])
    .filter((task) => props.grants.has(`${change.brick}.${task.id}`) && !(direct && task.needsApproval))
  const found = held.find((task) => task.kind === 'edit' && fields.every((field) => task.fields.includes(field)))
    ?? (change.own ? held.find((task) => task.kind === 'create') : undefined)
  return found ? `${change.brick}.${found.id}` : undefined
}

function canUndo(change: Change): boolean {
  return change.kind === 'save' && !change.undoneBy && (props.manager || taskFor(change, true) !== undefined)
}

/** Why the server would refuse an undo of this save (an undone one keeps its badge instead). */
function undoBlockedText(change: Change): string | undefined {
  const block = change.undoBlocked
  if (block === 'changed') return t('history.undoBlocked.changed')
  if (block === 'removed') return t('history.undoBlocked.removed')
  if (block === 'schema') return t('history.undoBlocked.schema')
  return undefined
}

/** The change whose fields are shown: in the right column from 1280px, else under its row. One at a time. */
const wide = useMediaQuery('(min-width: 1280px)', { ssrWidth: 1024 })
const showing = ref<string | null>(null)
const toggleShow = (id: string) => { showing.value = showing.value === id ? null : id }
/** The shown change while it is in the list (a new filter can drop it). */
const shownRow = computed(() => rows.value.find((c) => c._id === showing.value))

const confirming = ref<string | null>(null)
/**
 * Every row that wrote values can be gone back to: a save, an undo (it holds the state before a bad save) and the
 * creation (the entry as it was made). A creation names no fields, so no staff task can be checked against it:
 * owners and admins only.
 */
function canRevert(change: Change): boolean {
  if (!change.entry) return false
  if (change.kind === 'create') return props.manager
  return (change.kind === 'save' || change.kind === 'undo') && !!change.fields?.length && (props.manager || taskFor(change) !== undefined)
}
/**
 * A save that cannot be undone says why; "Back to this version" is then the way out, so it sits in the Undo slot, not in
 * the menu. Not for a removed entry: going back needs the entry, and the row says to restore it first.
 */
const revertShown = (change: Change) => canRevert(change) && !!undoBlockedText(change) && change.undoBlocked !== 'removed' && confirming.value !== change._id
const hasMore = (change: Change) => (canRevert(change) && !undoBlockedText(change) && confirming.value !== change._id) || !!change.inTrash
// The question opens from the menu: focus goes into it instead of back to the menu button, and back to that button on Cancel.
let focusQuestion = false
function askRevert(id: string) {
  confirming.value = id
  focusQuestion = true
}
function askRevertHere(id: string) {
  confirming.value = id
  void nextTick(() => document.getElementById(`revert-${id}`)?.focus())
}
function menuClosed(event: Event, id: string) {
  if (!focusQuestion) return
  focusQuestion = false
  event.preventDefault()
  void nextTick(() => document.getElementById(`revert-${id}`)?.focus())
}
function cancelRevert(id: string) {
  confirming.value = null
  void nextTick(() => document.querySelector<HTMLElement>(`[data-more="${id}"]`)?.focus())
}
// What going back changes, read while the question is open (one row at a time). With the task the revert uses, so
// the preview leaves out what that task keeps (the week of the weekly task).
const version = useConvexQuery(api.entries.versionAt, () => {
  const change = rows.value.find((c) => c._id === confirming.value)
  if (!change?.entry) return 'skip'
  const task = taskFor(change)
  return { site: props.site, ...(task === undefined ? {} : { task }), entry: change.entry, change: change._id }
})
/** The answer for the open question; the one of the row asked before does not count. */
const versionShown = computed(() => (version.data.value?.change === confirming.value ? version.data.value : undefined))
const fieldsOf = (brick: string) => (Object.hasOwn(props.schema.bricks, brick) ? props.schema.bricks[brick]!.fields : undefined)
async function revert(change: Change) {
  await whileBusy(change._id, async () => {
    await ops.revertEntry(change.entry!, change._id, taskFor(change))
    confirming.value = null
  })
}

// One set for all loaded pages: each row stays disabled until its own undo or revert answered.
const busy = ref(new Set<string>())
async function whileBusy(id: string, run: () => Promise<unknown>) {
  busy.value = new Set(busy.value).add(id)
  try {
    await run()
  } finally {
    const next = new Set(busy.value)
    next.delete(id)
    busy.value = next
  }
}
async function undo(change: Change) {
  await whileBusy(change._id, () => ops.undoChange(change._id, taskFor(change, true)))
}
</script>

<template>
  <div :class="asideShown ? 'grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-6' : ''">
    <div class="grid min-w-0 gap-6">
      <slot />
      <p v-if="list.error.value" class="font-semibold text-destructive" role="alert">{{ t('history.loadFailed') }}</p>
      <div v-if="loading" class="grid gap-2" aria-hidden="true">
        <Skeleton class="h-4 w-24" />
        <div class="divide-y rounded-xl border">
          <div v-for="n in 4" :key="n" class="flex items-center gap-4 px-4 py-3.5">
            <Skeleton class="h-3.5 w-10" />
            <div class="grid flex-1 gap-2"><Skeleton class="h-4 w-2/3" /><Skeleton class="h-3 w-1/3" /></div>
          </div>
        </div>
      </div>
      <section v-for="day in days" :key="day.key" class="grid gap-2" :aria-labelledby="`day-${day.key}`">
        <h2 :id="`day-${day.key}`" class="text-[13px] leading-5 font-medium text-muted-foreground">{{ day.label }}</h2>
        <!-- From 640px the rows share the card's columns (subgrid): time, what and who, Show changes, Undo, more. -->
        <ol class="m-0 list-none divide-y rounded-xl border bg-card p-0 min-[640px]:grid min-[640px]:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]">
          <li
            v-for="change in day.rows"
            :key="change._id"
            :class="['grid grid-cols-1 gap-y-2 px-4 py-3 min-[640px]:col-span-full min-[640px]:grid-cols-subgrid min-[640px]:gap-x-2 min-[640px]:py-2.5',
                     wide && showing === change._id ? 'bg-foreground/[0.03]' : '']"
          >
            <time :datetime="new Date(change.at).toISOString()" :title="fullDate(change.at)" class="hidden text-[13px] tabular-nums text-muted-foreground min-[640px]:block min-[640px]:row-start-1 min-[640px]:pr-2 min-[640px]:pt-[7px]">{{ clock(change.at) }}</time>
            <div class="grid min-w-0 content-center gap-0.5 min-[640px]:col-start-2 min-[640px]:row-start-1 min-[640px]:min-h-9">
              <p class="text-base font-medium [overflow-wrap:anywhere] min-[900px]:text-sm">
                {{ sentenceOf(change) }}
                <Badge v-if="areaOf(change)" as="span" variant="soft" class="ml-1 align-[1px] font-normal text-muted-foreground max-[639px]:hidden">{{ areaOf(change) }}</Badge>
                <Badge v-if="change.undoneBy" as="span" variant="soft" class="ml-1 align-[1px]">{{ t('entry.changes.undone') }}</Badge>
              </p>
              <div class="flex flex-wrap items-center gap-x-1 text-[13px] text-muted-foreground">
                <p class="text-[13px] [overflow-wrap:anywhere]">{{ whoLine(change) }}</p>
                <!-- Phones have no time column: the time follows the name. -->
                <span class="tabular-nums min-[640px]:hidden" :title="fullDate(change.at)">· {{ clock(change.at) }}</span>
                <!-- Below 640px the area chip joins this line, so a row does not grow a short line of its own. -->
                <Badge v-if="areaOf(change)" as="span" variant="soft" class="font-normal text-muted-foreground min-[640px]:hidden">{{ areaOf(change) }}</Badge>
              </div>
              <p v-if="canUndo(change) && undoBlockedText(change)" class="text-[13px] text-muted-foreground">{{ undoBlockedText(change) }}</p>
            </div>
            <div v-if="change.fields?.length || (canUndo(change) && !undoBlockedText(change)) || revertShown(change) || hasMore(change)" :class="['flex flex-wrap items-center gap-1 min-[640px]:contents', change.fields?.length ? '-ml-3' : '']">
              <Button
                v-if="change.fields?.length"
                type="button"
                variant="ghost" size="sm"
                class="min-[640px]:col-start-3 min-[640px]:row-start-1 min-[640px]:self-start"
                :aria-expanded="showing === change._id"
                @click="toggleShow(change._id)"
              >{{ showing === change._id ? t('history.hideChanges') : t('history.showChanges') }}</Button>
              <Button
                v-if="canUndo(change) && !undoBlockedText(change)"
                type="button"
                variant="outline"
                size="sm"
                class="min-[640px]:col-start-4 min-[640px]:row-start-1 min-[640px]:self-start min-[640px]:justify-self-start"
                :disabled="busy.has(change._id)"
                @click="undo(change)"
              >{{ t('entry.changes.undo') }}</Button>
              <Button
                v-else-if="revertShown(change)"
                :data-more="change._id"
                type="button"
                variant="outline"
                size="sm"
                class="min-[640px]:col-start-4 min-[640px]:row-start-1 min-[640px]:self-start min-[640px]:justify-self-start"
                :disabled="busy.has(change._id)"
                @click="askRevertHere(change._id)"
              >{{ t('history.revert') }}</Button>
              <DropdownMenu v-if="hasMore(change)">
                <DropdownMenuTrigger as-child>
                  <Button :data-more="change._id" type="button" variant="ghost" size="icon-sm" class="min-[640px]:col-start-5 min-[640px]:row-start-1 min-[640px]:self-start" :aria-label="t('history.more')">
                    <EllipsisIcon class="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" @close-auto-focus="menuClosed($event, change._id)">
                  <DropdownMenuItem v-if="canRevert(change) && !undoBlockedText(change) && confirming !== change._id" class="min-h-9 pointer-coarse:min-h-11" @select="askRevert(change._id)">{{ t('history.revert') }}</DropdownMenuItem>
                  <DropdownMenuItem v-if="change.inTrash" as-child class="min-h-9 pointer-coarse:min-h-11">
                    <NuxtLink :to="`/s/${site}/all?removed`">{{ t('history.openTrash') }}</NuxtLink>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div
              v-if="confirming === change._id"
              :id="`revert-${change._id}`"
              tabindex="-1"
              class="grid gap-3 rounded-lg text-sm min-[640px]:col-start-2 min-[640px]:col-end-[-1] outline-none focus-visible:ring-3 focus-visible:ring-ring/80"
              role="group"
              :aria-label="t('history.revert')"
            >
              <p v-if="versionShown && !versionShown.diff.length">{{ t('history.alreadyThere') }}</p>
              <template v-else>
                <p>{{ t('history.revertConfirm', { date: fullDate(change.at) }) }}</p>
                <p v-if="version.error.value" class="font-medium text-destructive" role="alert">{{ opErrorOf(version.error.value).message }}</p>
                <template v-else-if="versionShown">
                  <p class="font-medium">{{ t('history.revertChanges') }}</p>
                  <ChangeDiff :diff="versionShown.diff" :fields="fieldsOf(change.brick)" :locale="schema.locales[0]!" :site="site" split />
                </template>
              </template>
              <div class="flex flex-wrap gap-2">
                <Button v-if="versionShown?.diff.length" type="button" size="sm" :disabled="busy.has(change._id)" @click="revert(change)">{{ t('history.revert') }}</Button>
                <Button type="button" variant="ghost" size="sm" @click="cancelRevert(change._id)">{{ t('entry.cancel') }}</Button>
              </div>
            </div>
            <section v-if="!wide && showing === change._id" class="min-w-0 min-[640px]:col-start-2 min-[640px]:col-end-[-1] min-[900px]:text-sm" :aria-label="t('history.detail')">
              <ChangeDetail :site="site" :change="change._id" :brick="change.brick" :schema="schema" />
            </section>
          </li>
        </ol>
      </section>
      <p v-if="!rows.length && list.status.value === 'success'" class="text-muted-foreground">{{ filter === 'entry' ? t('history.entryEmpty') : filter && filter !== 'all' ? t('history.noMatches') : t('entry.changes.empty') }}</p>
      <div v-if="list.canLoadMore.value || list.isLoadingMore.value">
        <Button type="button" variant="outline" :disabled="!list.canLoadMore.value" @click="list.loadMore(PAGE)">{{ t('site.history.loadOlder') }}</Button>
      </div>
    </div>
    <aside v-if="asideShown" class="sticky top-[calc(var(--studio-header-height)+1.5rem)] grid max-h-[calc(100dvh-var(--studio-header-height)-3rem)] min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
      <h2 id="change-detail" class="text-[13px] leading-5 font-medium text-muted-foreground">{{ t('history.detail') }}</h2>
      <section v-if="shownRow" class="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card" aria-labelledby="change-detail">
        <header class="flex items-start gap-2 border-b px-4 py-3">
          <div class="grid min-w-0 flex-1 gap-0.5">
            <h3 class="text-sm font-semibold [overflow-wrap:anywhere]">{{ sentenceOf(shownRow) }}</h3>
            <p class="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">{{ actorName(shownRow) }} · <span class="tabular-nums">{{ fullDate(shownRow.at) }}</span></p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" class="-mr-2" :aria-label="t('history.hideChanges')" @click="showing = null">
            <XIcon class="size-4" aria-hidden="true" />
          </Button>
        </header>
        <div class="min-h-0 overflow-y-auto p-4 text-sm">
          <ChangeDetail :site="site" :change="shownRow._id" :brick="shownRow.brick" :schema="schema" />
        </div>
      </section>
      <p v-else class="self-start rounded-xl border border-dashed px-4 py-6 text-[13px] text-muted-foreground">{{ t('history.detailEmpty') }}</p>
    </aside>
  </div>
</template>
