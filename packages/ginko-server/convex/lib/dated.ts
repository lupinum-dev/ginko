// Dated changes on the platform (D125): fields of an online entry that take their values from a day on, "a new price
// from 1 November". A row in `datedChanges` per entry and day; `datedChanges.applyDue` writes it into the entry at the
// first minute of its day. The core decides what a change may set and how it is applied (`changeIssues`, `dataOn`); this
// file holds what the save, the publish, the run on the day and the readers share.
import type { Json, Label } from '@lupinum/ginko'
import { addDays, changeIssues, dataOn, dayStartIn, entryBytes, fitsBudget, isDate, labelOf, MAX_DATED, NAME_MAX, occurrence, sizeDays, startTie, taskAsks, taskDates, taskEnds, todayIn, yearTooLong, type Change, type ChangeIssue, type Schema, type Task, type Time, type ValidateOptions } from '@lupinum/ginko/internal'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { byOf, fail, type Actor } from './access'
import { fileIdsOf, nextPrints, type Data, type Prints } from './content'
import type { Recorded } from './history'
import { underRoot } from './pending'
import { BUDGET, checkNewFiles, checkNewLinks, lookupsFor, overBudget, same as sameValue, syncFileRefs, uploadIdsOf } from './write'

export type Dated = Doc<'datedChanges'>

/** The entry's dated changes, waiting and stopped, in the order of their days. */
export function datedOf(ctx: QueryCtx, entry: Id<'entries'>): Promise<Dated[]> {
  return ctx.db.query('datedChanges').withIndex('by_entry', (q) => q.eq('entry', entry)).collect()
}

/** The dated changes of one brick of a site by entry, in the order of their days: one read for a list (D124). */
export async function datedByBrick(ctx: QueryCtx, site: Id<'sites'>, brick: string): Promise<Map<string, Dated[]>> {
  const rows = await ctx.db.query('datedChanges').withIndex('by_site_brick', (q) => q.eq('site', site).eq('brick', brick)).collect()
  const out = new Map<string, Dated[]>()
  for (const row of rows.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))) {
    const list = out.get(row.entry) ?? []
    list.push(row)
    out.set(row.entry, list)
  }
  return out
}

/** The rows as core changes, for the check: a stopped one waits for nobody, so it is left out. */
export function asChanges(rows: readonly Dated[]): Change[] {
  return rows.filter((r) => !r.stopped).map(changeOf)
}

/**
 * The rows the read lays over the entry or announces (slice 3, number 4): a change without an end that waits, an
 * exception whose start run let it through (`holds`), and an exception whose time still waits for its day (a yearly
 * one between two years). Never a stopped row, nor an exception whose day has come but whose start run has not passed.
 */
export function shownChanges(rows: readonly Dated[], today: string): Change[] {
  return rows.filter((r) => {
    if (r.stopped) return false
    if (r.until === undefined || r.holds !== undefined) return true
    const time = timeOf(r, today)
    return time !== undefined && time.from > today
  }).map(changeOf)
}

/** A row as a core change: a yearly one with its first days, `occurrence` gives the others. */
export const changeOf = (r: Dated): Change => ({
  from: r.from, ...(r.until !== undefined ? { until: r.until } : {}), ...(r.yearly ? { yearly: r.yearly } : {}), ...(r.name !== undefined ? { name: r.name } : {}),
  set: r.fields as Record<string, Json>,
})

/**
 * The days of an exception row's time that holds on `day` or comes next (`occurrence`; a yearly row's of that year);
 * undefined for a change without an end and for a one-off one that has ended.
 */
export const timeOf = (r: Dated, day: string): Time | undefined => occurrence(changeOf(r), day)

/** Whether a time of `r` starts on `day`: a change without an end on its day, an exception on the start of a time. */
export const startsOn = (r: Dated, day: string) => (r.until === undefined ? r.from : timeOf(r, day)?.from) === day

/** Whether `r` is the row of the days `from` to `until` (one row per days, slice 3): a yearly one by its time then. */
export const isRowOf = (r: Dated, from: string, until: string | undefined) => (until === undefined || r.until === undefined
  ? r.until === until && r.from === from
  : timeOf(r, from)?.from === from && timeOf(r, from)?.until === until)

/** An exception that holds: its start run passed and it has not been stopped. */
export const isHolding = (r: Dated) => r.until !== undefined && r.holds !== undefined && !r.stopped

/** The rows as `statusOf` reads them (`StatusInput.changes`). */
export function statusChanges(rows: readonly Dated[]) {
  return rows.map((r) => ({ from: r.from, ...(r.until !== undefined ? { until: r.until } : {}), fields: Object.keys(r.fields), ...(r.by ? { by: r.by } : {}), ...(r.stopped ? { stopped: r.stopped } : {}) }))
}

/** The first instant of `day` in the site's zone, in ms: when a change of that day starts (`dayStartIn`). */
export const dayStart = dayStartIn

/** The first instant after `until` in the site's zone: when an exception ends (its end run). */
export const endOf = (until: string, timeZone: string) => dayStartIn(addDays(until, 1), timeZone)

/** The same date next year: no day of a change may be later. */
const yearAhead = (today: string) => `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`
/** The same date last year: a yearly change may start no earlier (slice 4, decision 3). */
const yearBack = (today: string) => `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`

/**
 * A day for a new or moved change: a real day, at most a year ahead (the same date next year). A change without an end
 * starts after the site's today; an exception (`exception`) may start today, never before (slice 3); a yearly one
 * (`yearly`) up to a year back, so a season typed inside its days holds at once (slice 4, decision 3).
 */
export function checkDay(schema: Schema, from: unknown, opts: { exception?: boolean; yearly?: boolean } = {}): asserts from is string {
  if (!isDate(from)) fail('INVALID', 'errors.dayInvalid')
  const today = todayIn(schema.timeZone)
  if (opts.yearly) {
    if (from < yearBack(today)) fail('INVALID', 'errors.dayTooFarBack')
  } else if (opts.exception ? from < today : from <= today) fail('INVALID', opts.exception ? 'errors.dayBeforeToday' : 'errors.dayNotAhead')
  if (from > yearAhead(today)) fail('INVALID', 'errors.dayTooFarAhead')
}

/**
 * The last day of an exception: a real day, on or after `from`, not before today and at most a year ahead. A yearly
 * one's end may have passed (it waits for next year) unless its time holds now (`holding`), and its days must be
 * shorter than a year, else it would never end (`yearTooLong`).
 */
export function checkUntil(schema: Schema, from: string, until: unknown, opts: { yearly?: boolean; holding?: boolean } = {}): asserts until is string {
  if (!isDate(until)) fail('INVALID', 'errors.dayInvalid')
  if (until < from) fail('INVALID', 'errors.untilBeforeFrom')
  const today = todayIn(schema.timeZone)
  if ((!opts.yearly || opts.holding) && until < today) fail('INVALID', 'errors.dayBeforeToday')
  if (opts.yearly) {
    if (yearTooLong({ from, until, yearly: true, set: {} })) fail('INVALID', 'errors.yearlyTooLong')
  } else if (until > yearAhead(today)) fail('INVALID', 'errors.dayTooFarAhead')
}

/**
 * `yearly` and `name` of a save (slice 4): both only with an end; the name trimmed, 1 to `NAME_MAX` characters. Gives
 * the name as it is stored.
 */
export function checkLabels(until: string | undefined, yearly: true | undefined, name: string | undefined): string | undefined {
  if (yearly && until === undefined) fail('INVALID', 'errors.yearlyNeedsUntil')
  if (name === undefined) return undefined
  if (until === undefined) fail('INVALID', 'errors.nameNeedsUntil')
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > NAME_MAX) fail('INVALID', 'errors.nameLength', { max: NAME_MAX })
  return trimmed
}

/** The task `ref` (`brick.id`) of the schema, or undefined. */
export function taskOf(schema: Schema, ref: string | undefined): Task | undefined {
  if (ref === undefined) return undefined
  const [brick, id] = ref.split('.')
  return brick !== undefined && Object.hasOwn(schema.bricks, brick) ? schema.bricks[brick]!.tasks?.find((t) => t.id === id) : undefined
}

/**
 * A save, publish, move or cancel through a task may give a day only when the task says so (D123): `when.from: 'ask'` or
 * `'@today'`. With `days` it checks a write's days against the task: a task with `until` only with both days, an end
 * only through such a task, a today-only task only for today, and `yearly` or a name only through a task that asks
 * for it (slice 4). The full rights of a brick (no task) may always date.
 */
export function refuseTaskWithoutDay(schema: Schema, ref: string | undefined, days?: { from: string | undefined; until: string | undefined; yearly?: true; name?: string }) {
  if (ref === undefined) return
  const task = taskOf(schema, ref)
  if (task?.kind !== 'edit' || !taskDates(task)) fail('FORBIDDEN', 'errors.taskCannotDate')
  if (!days) return
  if (taskEnds(task) && (days.from === undefined || days.until === undefined)) fail('FORBIDDEN', 'errors.taskNeedsDays')
  if ((days.until !== undefined) !== taskEnds(task)) fail('FORBIDDEN', 'errors.taskCannotDate')
  const asks = taskAsks(task)
  if (days.yearly && !asks.yearly) fail('FORBIDDEN', 'errors.taskCannotYearly')
  if (days.name !== undefined && !asks.name) fail('FORBIDDEN', 'errors.taskCannotName')
  const today = todayIn(schema.timeZone)
  if (task.when?.from === '@today' && (days.from !== today || days.until !== today)) fail('FORBIDDEN', 'errors.todayOnly')
}

/** Whether a task has an end (`when.until`): its values lie over an entry for some days and never go into it. */
export function taskHasEnd(schema: Schema, ref: string | undefined): boolean {
  const task = taskOf(schema, ref)
  return task?.kind === 'edit' && taskEnds(task)
}

/** The fixed values of a task (`set`), or none. */
export function taskSet(schema: Schema, ref: string | undefined): Record<string, Json> {
  const task = taskOf(schema, ref)
  return task?.kind === 'edit' && task.set ? task.set as Record<string, Json> : {}
}

/** Whether a change of `roots` changes what a page reads ahead (`timeline.public`), so the site's cache must go (D125). */
export function touchesPublic(schema: Schema, brickKey: string, roots: readonly string[]): boolean {
  const brick = Object.hasOwn(schema.bricks, brickKey) ? schema.bricks[brickKey] : undefined
  return !!brick?.timeline?.public.some((name) => roots.includes(name))
}

/** The labels of `roots` in each language, joined; a field that is gone since keeps its key. */
export function fieldNames(schema: Schema, brickKey: string, roots: readonly string[]): Label {
  const fields = schema.bricks[brickKey]?.fields ?? {}
  const main = schema.locales[0]!
  return Object.fromEntries(schema.locales.map((l) => [l, roots.map((k) => (Object.hasOwn(fields, k) ? labelOf(fields[k]!.label, l, main) : k)).join(', ')]))
}

/** The file references of one dated change (holder 'dated', one per change), so the uploads sweep keeps its files. */
export async function syncDatedRefs(ctx: MutationCtx, schema: Schema, row: Pick<Dated, '_id' | 'site' | 'brick' | 'fields'>) {
  const brick = Object.hasOwn(schema.bricks, row.brick) ? schema.bricks[row.brick] : undefined
  const ids = brick ? fileIdsOf(brick.fields, row.fields as Data, { isUploadId: uploadIdsOf(ctx) }) : new Set<string>()
  await syncFileRefs(ctx, row.site, 'dated', row._id, ids)
}

/**
 * The waiting changes that come with an entry from outside (an import, the demo corpus, the migration of `planned`):
 * a row and a run per change, without a person and without prints. A row the entry already has for that day takes the
 * fields it lacks (one row per day, D125); its own values stay. `rev` is the entry's rev they were made at. The caller
 * checked them (`changeIssues`) and already wrote the passed ones into the entry (`dataOn`, `waitingChanges`).
 */
export async function insertWaiting(ctx: MutationCtx, schema: Schema, entry: Pick<Doc<'entries'>, '_id' | 'site' | 'brick' | 'rev'> & { state?: 'draft' | 'live' }, changes: readonly Change[]) {
  const today = todayIn(schema.timeZone)
  for (const change of changes) {
    // An exception is a row of its own (identity: entry, from, until). One that holds today was checked with the entry
    // like a start run, so it holds at once; the others wait for their start run. On an entry that is not online a
    // current one comes back stopped, as its start run stops it (ruling 3, round L5): it would show unchecked the moment
    // the entry goes online. A yearly one keeps its first days; its time of today decides (slice 4).
    if (change.until !== undefined) {
      const time = occurrence(change, today)
      const started = time !== undefined && time.from <= today
      const stopped = started && entry.state === 'draft'
        ? { at: dayStart(time.from, schema.timeZone), reason: { code: 'invalid' as const, fields: Object.keys(change.set), cause: { key: 'errors.exceptionNotOnline' } } }
        : undefined
      const holds = started && !stopped
      const dated = await ctx.db.insert('datedChanges', {
        site: entry.site, entry: entry._id, brick: entry.brick, from: change.from, until: change.until,
        ...(change.yearly ? { yearly: change.yearly } : {}), ...(change.name !== undefined ? { name: change.name } : {}), fields: change.set, prints: {},
        revs: Object.fromEntries(Object.keys(change.set).map((root) => [root, entry.rev])), at: Date.now(), ...(holds ? { holds: Date.now() } : {}), ...(stopped ? { stopped } : {}),
      })
      if (!stopped) await ctx.db.patch(dated, { job: await scheduleRun(ctx, schema, dated, change, holds) })
      await syncDatedRefs(ctx, schema, { _id: dated, site: entry.site, brick: entry.brick, fields: change.set })
      continue
    }
    const same = (await datedOf(ctx, entry._id)).find((r) => r.from === change.from && r.until === undefined)
    if (same) {
      const added = Object.keys(change.set).filter((root) => !Object.hasOwn(same.fields as object, root))
      const fields = { ...Object.fromEntries(added.map((root) => [root, change.set[root]!])), ...(same.fields as Record<string, Json>) }
      // Fields joined into a waiting row come from someone other than its `by` (H2).
      await ctx.db.patch(same._id, { fields, revs: { ...Object.fromEntries(added.map((root) => [root, entry.rev])), ...same.revs }, ...(added.length && !same.stopped ? { shared: true as const } : {}) })
      await syncDatedRefs(ctx, schema, { _id: same._id, site: entry.site, brick: entry.brick, fields })
      continue
    }
    const dated = await ctx.db.insert('datedChanges', {
      site: entry.site, entry: entry._id, brick: entry.brick, from: change.from, fields: change.set, prints: {},
      revs: Object.fromEntries(Object.keys(change.set).map((root) => [root, entry.rev])), at: Date.now(),
    })
    await ctx.db.patch(dated, { job: await ctx.scheduler.runAt(dayStart(change.from, schema.timeZone), internal.datedChanges.applyDue, { change: dated, from: change.from }) })
    await syncDatedRefs(ctx, schema, { _id: dated, site: entry.site, brick: entry.brick, fields: change.set })
  }
}

/**
 * The run a row waits for: the start of its day (`applyDue`: written into the entry, or an exception's start run), or,
 * for an exception that holds, its end (`endDue`, the first minute after `until`). An exception's days are those of its
 * time of today (`occurrence`): a yearly one between two years waits for its next start.
 */
export function scheduleRun(ctx: MutationCtx, schema: Schema, id: Id<'datedChanges'>, change: Change, holds: boolean) {
  const time = occurrence(change, todayIn(schema.timeZone))
  if (holds && change.until !== undefined) {
    const until = time?.until ?? change.until
    return ctx.scheduler.runAt(endOf(until, schema.timeZone), internal.datedChanges.endDue, { change: id, until })
  }
  const from = time?.from ?? change.from
  return ctx.scheduler.runAt(dayStart(from, schema.timeZone), internal.datedChanges.applyDue, { change: id, from })
}

/** Deletes a dated change with its job (unless that run is the one calling) and its file references. */
export async function dropDated(ctx: MutationCtx, row: Dated, running = false) {
  if (row.job && !running) await ctx.scheduler.cancel(row.job)
  await syncFileRefs(ctx, row.site, 'dated', row._id, new Set())
  await ctx.db.delete(row._id)
}

/** What a checked dated save or publish writes: the row of that day (new or merged) and the values around it. */
export interface DatedPlan {
  from: string
  /** The last day of an exception; absent for a change without an end. */
  until: string | undefined
  /** An exception that comes back every year, and its name (slice 4): the row takes both as they are here. */
  yearly: true | undefined
  name: string | undefined
  /** The row of the same days (or the holding row being edited) that it merges into. */
  same: Dated | undefined
  /** Every field of the row after the merge, and the prints under them. */
  fields: Record<string, Json>
  prints: Prints
  /** The fields this save gives, with the values of the day before and after, for the history and a request. */
  roots: string[]
  before: Record<string, Json>
  after: Record<string, Json>
}

/**
 * The problems that `changes` has and `others` (the same list without the new change) does not, by day, path and code:
 * what the new change breaks on any day, also on the day of another change (a field it clears that a later change
 * shows). A problem a waiting change already has by itself is not the new change's.
 */
export async function newIssues(schema: Schema, brick: string, live: Data, others: Change[], changes: Change[], lookups: Omit<ValidateOptions, 'mode' | 'changed'>) {
  const keyOf = (i: ChangeIssue) => `${i.from}\u0000${i.path}\u0000${i.code}`
  const had = new Set((await changeIssues(schema, brick, live, others, lookups)).map(keyOf))
  return (await changeIssues(schema, brick, live, changes, lookups)).filter((i) => !had.has(keyOf(i)))
}

/**
 * The rows whose values a change of `from` starts from (its `before`): a change without an end starts from the normal
 * values, so only the other changes without an end (round L5); an exception from what the day shows with them all.
 */
export const baseRows = (rows: readonly Dated[], until: string | undefined) => (until === undefined ? rows.filter((r) => r.until === undefined) : rows)

/**
 * Checks a dated change of `entry` and merges it into the row of the same day (D125): `set` holds root fields in storage
 * format (null clears). The check of D119 runs over every waiting change, and only what this change adds refuses it
 * (`newIssues`); then the files and the links it adds (a draft planned for that day counts as
 * online), the entry's budget with every waiting change applied, and at most `MAX_DATED` waiting changes. A field given
 * with the value it already has on that day leaves the row; `fields` empty means nothing waits for that day any more.
 *
 * With `until` it is an exception (slice 3): its row is the one of the same two days, or `same` (the holding row a save
 * edits, whose end and values may change). Every field sent stays in it (an exception says what visitors see on its
 * days, also where that is the normal value), and a second exception whose time starts on a day a time of this one
 * starts may not set one of its fields (`startTie`, `errors.datedSameStart`, naming the end of that other time). With
 * `yearly` it comes back every year (slice 4), `name` labels it.
 */
export async function planDated(ctx: QueryCtx, site: Doc<'sites'>, entry: Doc<'entries'>, from: string, set: Record<string, Json>, rows: readonly Dated[], opts: { until?: string; same?: Dated; yearly?: true; name?: string } = {}): Promise<DatedPlan> {
  const schema = site.schema as Schema
  const brick = schema.bricks[entry.brick]!
  const { until, yearly, name } = opts
  const same = opts.same ?? rows.find((r) => isRowOf(r, from, until))
  const others = rows.filter((r) => r._id !== same?._id)
  const live = entry.data as Data
  const before = dataOn(live, asChanges(baseRows(others, until)), from)
  const fields: Record<string, Json> = { ...(same?.fields as Record<string, Json> | undefined) }
  const roots = Object.keys(set)
  // Every field sent is meant: it leaves the change only when it holds the live value and no earlier waiting change
  // sets it. A value that only an earlier change gives stays, so cancelling that change does not take this one along.
  // A stopped change gives nothing (G4).
  const earlier = others.filter((r) => !r.stopped && r.from < from)
  for (const root of roots) {
    if (until === undefined && sameValue(set[root], live[root]) && !earlier.some((r) => Object.hasOwn(r.fields as object, root))) delete fields[root]
    else fields[root] = set[root] ?? null
  }
  const own: Change = { from, ...(until !== undefined ? { until } : {}), ...(yearly ? { yearly } : {}), set: fields }
  if (until !== undefined) {
    const tie = startTie({ ...own, until }, others.filter((r) => !r.stopped).map(changeOf))
    // An error's text is worded without the site's zone (UTC on the server, the reader's in the Studio): noon UTC of the
    // day is that day from UTC-12 to UTC+11, where the first instant of a Vienna day is the day before in UTC.
    if (tie) fail('INVALID', 'errors.datedSameStart', { until: Date.parse(`${occurrence(tie.other, tie.day)!.until}T12:00:00Z`) })
  }
  const after = dataOn(before, [own], from)
  const main = schema.locales[0]!
  const keys = Object.keys(fields)
  const kept = Object.fromEntries(Object.entries(same?.prints ?? {}).filter(([leaf]) => !roots.some((r) => underRoot(leaf, r))))
  const fresh = nextPrints({ fields: brick.fields, roots, before, after, prints: entry.prints as Prints, main, confirm: undefined })
  const prints: Prints = { ...kept, ...Object.fromEntries(Object.entries(fresh).filter(([leaf]) => roots.some((r) => keys.includes(r) && underRoot(leaf, r)))) }
  const pick = (d: Data) => Object.fromEntries(roots.filter((r) => d[r] !== undefined).map((r) => [r, d[r]!]))
  const plan: DatedPlan = { from, until, yearly, name, same, fields, prints, roots, before: pick(before), after: pick(after) }
  if (!keys.length) return plan

  const changes: Change[] = [...asChanges(others), own]
  const issues = await newIssues(schema, entry.brick, live, asChanges(others), changes, await lookupsFor(ctx, site._id, brick.fields, after))
  if (issues.length) fail('INVALID', 'errors.pleaseCheckMarkedFields', undefined, { errors: issues.map(({ change: _, from: _day, ...issue }) => issue) as unknown as Json })
  await checkNewFiles(ctx, site._id, brick.fields, before, after)
  await checkNewLinks(ctx, site, [{ entry, fields: brick.fields, before, after }], dayStart(from, schema.timeZone))
  // The entry must fit on every day its changes give it values: after the last one, and on each exception's days.
  const allPrints = { ...(entry.prints as Prints), ...prints }
  const bytes = Math.max(...sizeDays(changes).map((day) => entryBytes(dataOn(live, changes, day), allPrints)))
  if (!fitsBudget(bytes, entry.bytes, BUDGET.entryBytes)) fail('TOO_LARGE', 'errors.entryTooLarge', overBudget(bytes, BUDGET.entryBytes))
  // A new day, or a stopped change that starts waiting again (H2).
  if ((!same || same.stopped) && others.filter((r) => !r.stopped).length >= MAX_DATED) fail('TOO_LARGE', 'errors.tooManyDated', { max: MAX_DATED })
  return plan
}

/** A history row of `writeDated`: the save of a change (`dated`) or fields taken out of one (`datedCancelled`). */
export type DatedLine = { kind: 'dated' | 'datedCancelled'; history: Recorded }

/**
 * Writes a checked plan: the row of its day (merged: `by` becomes this person, a stop is cleared and its run planned
 * again), its run at the first minute of the day, its file references, its history rows (`lines`, in order; `change` is
 * the first) and, when it touches a field of `timeline.public`, a new `contentRev`. An empty plan drops the row of that
 * day. The entry is not touched. `revs`: the entry rev each given root was saved at.
 */
export async function writeDated(ctx: MutationCtx, actor: Actor, entry: Doc<'entries'>, plan: DatedPlan, revs: Record<string, number>, lines: DatedLine[], opId: string) {
  const site = actor.site
  const schema = site.schema as Schema
  const now = Date.now()
  const touched = [...new Set([...plan.roots, ...Object.keys(plan.same?.fields ?? {})])]
  // An exception whose time holds today is its own start run (planDated checked it like one): it holds at once. A
  // holding row a save joins keeps holding.
  const today = todayIn(schema.timeZone)
  const change: Change = { from: plan.from, ...(plan.until !== undefined ? { until: plan.until } : {}), ...(plan.yearly ? { yearly: plan.yearly } : {}), set: plan.fields }
  const time = occurrence(change, today)
  const holding: number | undefined = plan.until === undefined ? undefined
    : plan.same && isHolding(plan.same) ? plan.same.holds
    : time !== undefined && time.from <= today ? now : undefined
  let id: Id<'datedChanges'> | undefined
  if (!Object.keys(plan.fields).length) {
    if (plan.same) await dropDated(ctx, plan.same)
  } else {
    const keptRevs = Object.fromEntries(Object.entries(plan.same?.revs ?? {}).filter(([root]) => Object.hasOwn(plan.fields, root)))
    const row = {
      fields: plan.fields, prints: plan.prints, revs: { ...keptRevs, ...Object.fromEntries(plan.roots.filter((r) => Object.hasOwn(plan.fields, r)).map((r) => [r, revs[r] ?? entry.rev])) }, by: actor.user.id, at: now,
      ...(plan.until !== undefined ? { until: plan.until } : {}), ...(holding !== undefined ? { holds: holding } : {}),
      ...(plan.yearly ? { yearly: plan.yearly } : {}), ...(plan.name !== undefined ? { name: plan.name } : {}),
    }
    if (plan.same) {
      id = plan.same._id
      // Someone else saves into a waiting row, or restarts a stopped one and keeps fields of it: it now holds values of
      // several people (H2, I2); a patch keeps a set flag.
      const keepsOld = Object.keys(plan.same.fields).some((root) => !plan.roots.includes(root) && Object.hasOwn(plan.fields, root))
      const shared = plan.same.by !== actor.user.id && (!plan.same.stopped || keepsOld)
      // The save says yearly and the name anew: one it leaves out goes.
      await ctx.db.patch(id, { yearly: undefined, name: undefined, ...row, from: plan.from, stopped: undefined, ...(shared ? { shared: true as const } : {}) })
      // New days move its run (a waiting exception moved, the end of a holding one, yearly switched); a restarted
      // (stopped) row gets its run again.
      if (!plan.same.job || plan.same.from !== plan.from || plan.same.until !== plan.until || plan.same.yearly !== plan.yearly || (holding !== undefined && plan.same.holds === undefined)) {
        if (plan.same.job) await ctx.scheduler.cancel(plan.same.job)
        await ctx.db.patch(id, { job: await scheduleRun(ctx, schema, id, change, holding !== undefined) })
      }
    } else {
      id = await ctx.db.insert('datedChanges', { site: site._id, entry: entry._id, brick: entry.brick, from: plan.from, ...row })
      await ctx.db.patch(id, { job: await scheduleRun(ctx, schema, id, change, holding !== undefined) })
    }
    await syncDatedRefs(ctx, schema, { _id: id, site: site._id, brick: entry.brick, fields: plan.fields })
  }
  // What a page reads ahead changed, or what it shows today (a holding row, saved into or dropped).
  const shownToday = holding !== undefined || (plan.same !== undefined && isHolding(plan.same))
  const contentRev = shownToday || touchesPublic(schema, entry.brick, touched) ? site.contentRev + 1 : site.contentRev
  if (contentRev !== site.contentRev) await ctx.db.patch(site._id, { contentRev })
  const changes: Id<'changes'>[] = []
  for (const { kind, history } of lines) {
    changes.push(await ctx.db.insert('changes', {
      site: site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId, kind, ...history,
      entryRev: entry.rev, contentRev, at: now,
    }))
  }
  return { dated: id, change: changes[0]!, contentRev }
}
