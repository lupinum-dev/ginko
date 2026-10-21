// What Today (UI.md 3) reads and shows per area, without the page: the sections (every brick with tasks the person may
// do, schema order), the cards they form (a plan brick inside the card of the brick it plans), each section's state
// (status line, today flag, week, own proposals, timed rows) as one `View`, "Wartet auf dich" and the verdict line.
// The sheets and the writes stay on the page. Generic: nothing here knows the restaurant.
import type { Brick, CollectionBrick, Field, Json } from '@lupinum/ginko'
import { plannedWeeks, plansThisWeek, staleOf, visibleUntil, weeklyTask, workWeekOf, type StatusLine } from '@lupinum/ginko/internal'
import { textIn } from '@lupinum/ginko-editor'
import { api } from '#convex/api'
import type { Entry } from './useSiteData'
import { allAccess } from './useAll'
import { useLocalDraftRows } from './useLocalDraftRows'
import { useTextOf } from './useTextOf'
import { displayValue, formatDay, taskRef, titleOf, type Task } from '../utils/content'
import { shownLabel } from '../utils/labels'
import { cardsOf, rowFlags, verdictCount, waitingOf, type OwnRow, type Split } from '../utils/today'
import { whenFull } from '../utils/when'

export interface Section {
  key: string
  brick: Brick
  /** The tasks of this brick the person may do, schema order. */
  tasks: Task[]
  remove?: Task
  /** Time-limited collections list their entries (drafts apart, TodayDrafts). */
  listed: Entry[]
  /** "Entfernen" on each row (a timed list of at most 10 real rows), else the remove task is in "⋯". */
  removeOnRows: boolean
  /** The brick whose card this plan section sits in; undefined for a card's main section. */
  owner?: string
  /** Buttons and "⋯" (taskSplit, then cardSplit over the card). */
  split: Split
}

/** One card of the grid: the main section and the plan sections merged into it, schema order. */
export interface Card { key: string; main: Section; plans: Section[] }

export interface Row {
  e: Entry
  title: string
  /** What a tap opens (rowTarget); undefined: plain text. */
  target: { task: Task } | { to: string } | undefined
  timing: { text: string; dim: boolean }
  /** Shown labels of the yes/no fields set on it ("Ausgebucht", rowFlags). */
  flags: string[]
}

export interface Listing {
  /** The rows shown: current ones (5 while collapsed, else up to LISTED), then the expired ones on request. */
  rows: Row[]
  /** The list is cut at LISTED: link to the area. */
  more: boolean
  /** Expired rows behind "Abgelaufene anzeigen". */
  hiddenExpired: number
  /** Current rows behind "{n} weitere anzeigen"; 0 when expanded or short. */
  collapsed: number
}

/** A single's date preset to @today set to today or later ("Heute geschlossen" is entered), with Aufheben. */
export interface TodayFlag { task: Task; entry: Entry; date: string; field: Field }

export interface View {
  status?: { text: string; due: boolean; hours: boolean }
  /** sites.today is loading and this brick can have a line: a skeleton holds its place. */
  statusPending: boolean
  flag?: TodayFlag
  /** The flag is for today and the hours line says it: the line stands in the flag box, the status line is hidden. */
  flagIsHours: boolean
  flagTexts: string[]
  week?: { current: boolean; text: string }
  waiting: OwnRow[]
  rejected: OwnRow[]
  listing: Listing
  /** entries.ofBricks is loading and this is a timed list: row skeletons. */
  rowsPending: boolean
  due: boolean
  split: Split
}

/** Rows a timed collection lists at most; the area list has the rest. */
export const LISTED = 50
/** Above this many current rows a list shows COLLAPSED and "{n} weitere anzeigen". */
const LONG = 10
const COLLAPSED = 5

export function useTodayAreas(s: Awaited<ReturnType<typeof useSiteData>>) {
  const { t, format, locale } = useI18n()

  /** A collection whose entries only show for a time: Today lists them. */
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
      } else if (isTimed(brick) || (brick.kind === 'collection' && brick.drafts === true)) {
        keys.add(key)
        // A week planned ahead can start from the one the single shows this week ("Von dieser Woche übernehmen").
        if (brick.plans) keys.add(brick.plans.brick)
      }
    }
    return [...keys]
  })
  // Slim rows: collection entries carry only their titles, dates and small fields, so a timed collection near the site
  // budget stays a small live answer; a sheet reads the entry it edits whole (openRead). Still read in the browser
  // only: 2,000 entries with long text titles can pass the 1 MiB a server-rendered query may send.
  const shownRead = useConvexQuery(api.entries.ofBricks, () => (shownBricks.value.length ? { site: s.slug.value, bricks: shownBricks.value, slim: true } : 'skip'), { server: false })
  /** A collection's live entries in the site's order; a single's one entry. */
  const entriesOf = (key: string): Entry[] => (shownRead.data.value ?? []).filter((e) => e.brick === key)
  const singleOf = (key: string): Entry | undefined => entriesOf(key)[0]

  /** Each row has "Entfernen" while a timed list has at most 10 real rows (counted on all of them, not the shown ones). */
  const removeOnRows = (brick: Brick, listed: Entry[]) => isTimed(brick) && listed.length <= LONG
  const sections = computed<Section[]>(() => {
    const parts = withTasks.value.map(([key, brick]) => {
      const tasks = (brick.tasks ?? []).filter((t) => s.may(key, t))
      // Drafts are not on the website: they have their own list (TodayDrafts).
      const listed = isTimed(brick) ? entriesOf(key).filter((e) => e.state !== 'draft') : []
      return { key, brick, tasks, remove: tasks.find((t) => t.kind === 'remove'), listed, removeOnRows: removeOnRows(brick, listed) }
    })
    const placed = new Map(cardsOf(s.schema.value!, parts).flatMap((card) => card.sections.map((x) => [x.key, { owner: x.plan ? card.key : undefined, split: x.split }] as const)))
    return parts.map((p) => ({ ...p, ...placed.get(p.key)! }))
  })
  const cards = computed<Card[]>(() => sections.value.filter((sec) => !sec.owner).map((main) => ({ key: main.key, main, plans: sections.value.filter((p) => p.owner === main.key) })))

  /** Unsaved input kept in this browser opens where it was typed: Content, or a create task's sheet here. */
  const { editable } = allAccess(s)
  const openable = computed(() => editable.value.map(([key]) => key))
  const createTaskOf = (key: string, id: string) => sections.value.find((sec) => sec.key === key)?.tasks.find((t) => t.id === id && t.kind === 'create')
  const localRows = useLocalDraftRows({
    get slug() { return s.slug.value },
    get schema() { return s.schema.value! },
    get main() { return s.main.value },
    get bricks() { return openable.value },
    taskOf: createTaskOf,
  })

  /**
   * What a tap on a listed entry opens: the edit task's sheet when the person has one, else the entry in Content when
   * they may edit it there, else nothing (the row is plain text then).
   */
  function rowTarget(sec: Pick<Section, 'key' | 'tasks'>, entry: Entry): Row['target'] {
    const task = sec.tasks.find((t) => t.kind === 'edit')
    if (task) return { task }
    if (s.isManager.value) return { to: `/s/${s.slug.value}/all/${sec.key}/${entry._id}` }
    return undefined
  }
  /** Sections whose expired entries the person asked to see. */
  const expiredShown = reactive(new Set<string>())
  /** Sections whose long current list the person opened past the first COLLAPSED rows. */
  const expanded = reactive(new Set<string>())
  // What is on the website now or later comes first, at most LISTED (the area list has the rest); the expired entries
  // follow only on request: the LISTED that ended last, in the list's order. A collection of 450 events stays a short
  // page, and the area list is linked whenever a group is cut. A long current list shows its first rows until opened.
  const listings = computed<Record<string, Listing>>(() => Object.fromEntries(sections.value.map((sec) => {
    const brick = sec.brick as CollectionBrick
    const rows = sec.listed.map((e): Row => {
      const flags = rowFlags(brick, sec.tasks, e.data as Record<string, Json>).map((f) => shownLabel(brick.fields[f]!.label, s.main.value))
      return { e, title: titleOf(brick, e.data, s.main.value), target: rowTarget(sec, e), timing: timing(brick, e), flags }
    })
    const current = rows.filter((r) => !r.timing.dim)
    const expired = rows.filter((r) => r.timing.dim)
    const showExpired = expiredShown.has(sec.key)
    const open = showExpired || expanded.has(sec.key) || current.length <= LONG
    const endOf = (r: Row) => visibleUntil(sec.brick, r.e.data) ?? ''
    const latest = new Set(expired.toSorted((a, b) => endOf(b).localeCompare(endOf(a))).slice(0, LISTED))
    const shown = current.slice(0, open ? LISTED : COLLAPSED)
    return [sec.key, {
      rows: [...shown, ...(showExpired ? expired.filter((r) => latest.has(r)) : [])],
      more: current.length > LISTED || (showExpired && expired.length > LISTED),
      hiddenExpired: showExpired ? 0 : expired.length,
      collapsed: Math.min(current.length, LISTED) - shown.length,
    }]
  })))

  /** The rows list of section `key`: the first list under its heading (a plan's own sub-section, or the card's main). */
  const listOf = (key: string) => document.getElementById(`b-${key}`)?.closest('section')?.querySelector<HTMLElement>('ul')
  /**
   * Shows a section's expired entries, after its whole current list. The button goes away, so focus moves to where they
   * start: the first expired row when it opens something, else the list.
   */
  function showExpired(key: string) {
    expiredShown.add(key)
    nextTick(() => {
      const list = listOf(key)
      const row = list?.querySelector('li[data-dim] > :first-child')
      if (row instanceof HTMLButtonElement || row instanceof HTMLAnchorElement) row.focus()
      else list?.focus()
    })
  }
  /** Opens a collapsed list in place; focus moves to the first row that was hidden (its first focusable element), else the list. */
  function expand(key: string) {
    expanded.add(key)
    nextTick(() => {
      const list = listOf(key)
      const target = list?.querySelectorAll('li')[COLLAPSED]?.querySelector<HTMLElement>('button, a[href]')
      ;(target ?? list)?.focus()
    })
  }

  /** "until 8.10." / the date range / "expired on 7.10." for a timed entry. */
  function timing(brick: CollectionBrick, entry: Entry): { text: string; dim: boolean } {
    const vis = brick.visible
    if (!vis || vis.mode === 'always') return { text: '', dim: false }
    const today = s.today.value
    const until = visibleUntil(brick, entry.data)
    if (!until) return { text: t('site.status.noEnd'), dim: false }
    const visible = until >= today
    if (brick.fields[vis.field]?.type === 'daterange') return { text: displayValue({ type: 'daterange', label: '' }, entry.data[vis.field], s.main.value, { t, format }), dim: !visible }
    return visible ? { text: until === today ? t('site.status.untilToday') : t('site.status.until', { date: formatDay(until, format) }), dim: false } : { text: t('site.status.expired', { date: formatDay(until, format) }), dim: true }
  }

  /**
   * A single's date field preset to @today, set to today or a later day, shows "<task> ist für heute eingetragen" (or
   * "<field> <day> ist eingetragen") with Aufheben (UI.md 3). A past day no longer counts.
   */
  function todayFlag(key: string, brick: Brick, tasks: Task[]): TodayFlag | undefined {
    const entry = singleOf(key)
    if (!entry) return undefined
    for (const t of tasks) {
      if (t.kind !== 'edit' || !t.prefill) continue
      for (const [field, token] of Object.entries(t.prefill)) {
        const date = entry.data[field]
        if (token === '@today' && brick.fields[field]?.type === 'date' && typeof date === 'string' && date >= s.today.value) return { task: t, entry, date, field: brick.fields[field]! }
      }
    }
    return undefined
  }

  /** The texts the person typed for a "today" task (e.g. the closing note), shown with its state. */
  function flagTexts(brick: Brick, flag: { task: Task; entry: Entry }): string[] {
    if (flag.task.kind !== 'edit') return []
    return flag.task.fields.filter((f) => brick.fields[f]?.type === 'text').map((f) => textIn(flag.entry.data[f], s.main.value)).filter(Boolean)
  }

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

  /** A single's date field preset to @workWeek shows whether it is this week's (UI.md 3, weekly upkeep). The rule is `staleOf`, the same the reminder mail uses. */
  function weekState(key: string, brick: Brick): { current: boolean; text: string } | undefined {
    const entry = singleOf(key)
    if (!entry) return undefined
    const plan = plannedNow(key)
    if (plan) {
      const field = s.schema.value!.bricks[plan.key]!.fields[plan.field]
      return { current: true, text: t('site.quick.plannedWeek', { label: field ? shownLabel(field.label, s.main.value) : '', date: formatDay(plan.start, format) }) }
    }
    const state = staleOf(brick, entry.data, s.today.value, s.schema.value!.week, plannedWeeks(s.schema.value!, key, (k) => entriesOf(k).filter((e) => e.state !== 'draft').map((e) => ({ data: e.data as Record<string, Json> }))))
    if (!state) return undefined
    const text = state.stored ? t('today.week.stored', { label: shownLabel(brick.fields[state.field]!.label, s.main.value), date: formatDay(state.stored, format) }) : t('site.quick.notFilled')
    return { current: state.current, text: state.current ? text : t('today.week.stale', { week: text }) }
  }

  // Each section's status line and whether it is due (sites.today): browser only, it reads all entries of the task
  // bricks and should not slow the server render. The managers' review count too, like every reader of it: the layout's
  // rail badge cannot read it on the server (the role is not known yet there), and a count a page read on the server
  // reaches the rail while it hydrates, so the rail's badge would not match the server's HTML.
  const statusRead = useConvexQuery(api.sites.today, () => ({ site: s.slug.value }), { server: false })
  const stateOf = (key: string) => statusRead.data.value?.find((x) => x.brick === key)
  const reviewRead = useConvexQuery(api.proposals.count, () => (s.isManager.value ? { site: s.slug.value } : 'skip'), { server: false })
  /** A section needs doing: its status is due, or its week is not entered (filled first button, UI.md 3). */
  const isDue = (key: string, brick: Brick) => !!stateOf(key)?.due || weekState(key, brick)?.current === false

  /** The words of a status line; "<n> online" only when the list is cut (`folded`), else null for a count. */
  function statusText(brick: Brick, line: StatusLine, folded: boolean): string | null {
    const title = (value: string | null) => value ?? shownLabel(brick.label, s.main.value)
    switch (line.kind) {
      case 'next': return t('server.status.next', { title: title(line.title), date: formatDay(line.date, format) })
      case 'count': return line.ending > 0 ? t('server.status.ending', { count: line.ending }) : folded ? t('server.status.online', { count: line.online }) : null
      case 'missing': return t('server.status.missing', { count: line.count, field: shownLabel(brick.fields[line.field]?.label ?? line.field, s.main.value) })
      case 'age': return line.weeks > 0 ? t('server.status.age', { title: title(line.title), weeks: line.weeks }) : t('server.status.ageThisWeek', { title: title(line.title) })
      case 'drafts': return t('server.status.drafts', { drafts: line.drafts, scheduled: line.scheduled })
      case 'hours': {
        const today = line.today
        if ('ranges' in today) return t('server.status.open', { ranges: new Intl.ListFormat(locale.value, { style: 'short', type: 'unit' }).format(today.ranges.map(([from, to]) => `${from}–${to}`)) })
        if ('unknown' in today) return t('server.status.hoursUnknown')
        return today.reason ? t('server.status.closedBecause', { reason: shownLabel(today.reason, s.main.value) }) : t('server.status.closed')
      }
    }
  }
  /** A section's status line: words, and whether it is due. */
  function statusOf(sec: Section): { text: string; due: boolean; hours: boolean } | undefined {
    const state = stateOf(sec.key)
    const text = state?.line ? statusText(sec.brick, state.line, !!listings.value[sec.key]?.more) : null
    return text ? { text, due: state!.due, hours: state!.line!.kind === 'hours' } : undefined
  }
  /** A brick that can have a status line: a skeleton holds its place while sites.today loads. */
  const canHaveLine = (brick: Brick) => !!brick.status || (brick.kind === 'collection' && brick.drafts === true) || (brick.kind === 'single' && !!weeklyTask(brick))

  // The person's own proposals (proposals.mine), rendered on the server so "Wartet auf dich" comes with the first
  // paint: each section says what of theirs waits for approval; a rejection is a tile with "Korrigieren" and a note in
  // the section. The server keeps a rejection only while it is the thing to fix.
  const ownRead = useConvexQuery(api.proposals.mine, () => ({ site: s.slug.value }))
  const textOf = useTextOf(() => ({ timeZone: s.schema.value?.timeZone ?? 'UTC', main: s.main.value }))
  const ownLine = (p: OwnRow) => textOf(p.msg, p.sentence)
  const ownWhen = (at: number) => whenFull(at, s.schema.value?.timeZone ?? 'UTC', format)
  /** A proposal made in the Studio through a task of `key` (an agent's are in Verlauf). */
  const ofSection = (key: string) => (p: OwnRow) => p.via === 'ui' && !!p.task?.startsWith(`${key}.`)
  /** Own open proposals and rejections still to fix of section `key`. */
  function ownOf(key: string) {
    return { waiting: (ownRead.data.value?.open ?? []).filter(ofSection(key)), rejected: (ownRead.data.value?.rejected ?? []).filter(ofSection(key)) }
  }
  /** The task a rejected proposal was made with, when the person still holds it. */
  const fixTask = (key: string, p: OwnRow) => (p.entry ? sections.value.find((x) => x.key === key)?.tasks.find((t) => taskRef(key, t) === p.task) : undefined)

  // The verdict waits for every source: it never says "nothing" before all have loaded. Unsaved input needs the
  // browser and the signed-in person.
  const auth = useConvexAuth()
  const mounted = ref(false)
  onMounted(() => { mounted.value = true })
  const ready = computed(() => mounted.value && !!auth.user.value?.id
    && (!sections.value.length || statusRead.data.value !== undefined)
    && (!shownBricks.value.length || shownRead.data.value !== undefined)
    && ownRead.data.value !== undefined
    && (!s.isManager.value || reviewRead.data.value !== undefined))
  /** A read failed before it had data: the state is unknown (an error after data keeps the last state). */
  const loadError = computed(() => [statusRead, shownRead, ownRead].some((q) => !!q.error?.value && q.data.value === undefined))
  const views = computed<Record<string, View>>(() => Object.fromEntries(sections.value.map((sec): [string, View] => {
    const status = statusOf(sec)
    const flag = sec.brick.kind === 'single' ? todayFlag(sec.key, sec.brick, sec.tasks) : undefined
    const flagIsHours = !!flag && flag.date === s.today.value && !!status?.hours
    const own = ownOf(sec.key)
    return [sec.key, {
      status,
      statusPending: statusRead.data.value === undefined && !loadError.value && canHaveLine(sec.brick),
      flag,
      flagIsHours,
      flagTexts: flag && !flagIsHours ? flagTexts(sec.brick, flag) : [],
      week: sec.brick.kind === 'single' ? weekState(sec.key, sec.brick) : undefined,
      waiting: own.waiting,
      rejected: own.rejected,
      listing: listings.value[sec.key]!,
      rowsPending: shownRead.data.value === undefined && !loadError.value && isTimed(sec.brick),
      due: isDue(sec.key, sec.brick),
      split: sec.split,
    }]
  })))

  /** The areas that need doing, main and plan sections, schema order: "Fällig:" links in the verdict. */
  const dueKeys = computed(() => sections.value.filter((sec) => views.value[sec.key]!.due).map((sec) => sec.key))
  // Planned changes that did not go live stay a week; Convex does not re-run the query as time passes, so the cut is here.
  const waiting = computed(() => {
    const keyed = (list: readonly OwnRow[] | undefined) => (list ?? []).flatMap((p) => {
      const sec = sections.value.find((x) => ofSection(x.key)(p))
      return sec ? [{ key: sec.key, p }] : []
    })
    return waitingOf({
      manager: s.isManager.value,
      review: reviewRead.data.value,
      rejected: keyed(ownRead.data.value?.rejected).map((r) => ({ ...r, fix: fixTask(r.key, r.p) })),
      unsaved: localRows.value,
      notLive: keyed(ownRead.data.value?.notLive),
      now: Date.now(),
    })
  })

  /** The verdict line once every source is in: how many things wait, and the due areas. */
  const verdict = computed(() => (ready.value && !loadError.value ? { count: verdictCount(waiting.value, dueKeys.value), due: dueKeys.value } : undefined))

  return {
    isTimed, withTasks, shownBricks, shownRead, entriesOf, singleOf,
    sections, cards, views, listings, rowTarget, showExpired, expand, timing,
    todayFlag, flagTexts, plannedNow, weekState,
    statusRead, stateOf, isDue, statusOf, reviewRead,
    ownRead, ownOf, ownLine, ownWhen, fixTask,
    openable, createTaskOf, localRows,
    waiting, dueKeys, ready, loadError, verdict,
  }
}
