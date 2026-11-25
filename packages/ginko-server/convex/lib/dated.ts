// Dated changes on the platform (D125): fields of an online entry that take their values from a day on, "a new price
// from 1 November". A row in `datedChanges` per entry and day; `datedChanges.applyDue` writes it into the entry at the
// first minute of its day. The core decides what a change may set and how it is applied (`changeIssues`, `dataOn`); this
// file holds what the save, the publish, the run on the day and the readers share.
import type { Json, Label } from '@lupinum/ginko'
import { changeIssues, dataOn, entryBytes, fitsBudget, isDate, labelOf, todayIn, zonedDateTime, type Change, type Schema } from '@lupinum/ginko/internal'
import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { byOf, fail, type Actor } from './access'
import { fileIdsOf, nextPrints, type Data, type Prints } from './content'
import type { Recorded } from './history'
import { underRoot } from './pending'
import { BUDGET, checkNewFiles, checkNewLinks, lookupsFor, overBudget, same as sameValue, syncFileRefs, uploadIdsOf } from './write'

export type Dated = Doc<'datedChanges'>

/** At most this many changes wait per entry (D125). */
export const MAX_DATED = 20

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

/** The waiting rows as core changes: a stopped one waits for nobody, so the bundle and the check leave it out. */
export function asChanges(rows: readonly Dated[]): Change[] {
  return rows.filter((r) => !r.stopped).map((r) => ({ from: r.from, set: r.fields as Record<string, Json> }))
}

/** The rows as `statusOf` reads them (`StatusInput.changes`). */
export function statusChanges(rows: readonly Dated[]) {
  return rows.map((r) => ({ from: r.from, fields: Object.keys(r.fields), ...(r.by ? { by: r.by } : {}), ...(r.stopped ? { stopped: r.stopped } : {}) }))
}

/** The first minute of `day` in the site's zone, in ms: when a change of that day starts. */
export const dayStart = (day: string, timeZone: string) => Date.parse(zonedDateTime(day, '00:00', timeZone))

/** A day for a new or moved change: a real day, after the site's today, at most a year ahead (the same date next year). */
export function checkDay(schema: Schema, from: unknown): asserts from is string {
  if (!isDate(from)) fail('INVALID', 'errors.dayInvalid')
  const today = todayIn(schema.timeZone)
  if (from <= today) fail('INVALID', 'errors.dayNotAhead')
  if (from > `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`) fail('INVALID', 'errors.dayTooFarAhead')
}

/**
 * A save or publish through a task may give a day only when the task says so (`when: { from: 'ask' }`, D123); the full
 * rights of a brick (no task) may always date.
 */
export function refuseTaskWithoutDay(schema: Schema, ref: string | undefined) {
  if (ref === undefined) return
  const [brick, id] = ref.split('.')
  const task = brick !== undefined && Object.hasOwn(schema.bricks, brick) ? schema.bricks[brick]!.tasks?.find((t) => t.id === id) : undefined
  if (task?.kind !== 'edit' || task.when?.from !== 'ask') fail('FORBIDDEN', 'errors.taskCannotDate')
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

/** Deletes a dated change with its job (unless that run is the one calling) and its file references. */
export async function dropDated(ctx: MutationCtx, row: Dated, running = false) {
  if (row.job && !running) await ctx.scheduler.cancel(row.job)
  await syncFileRefs(ctx, row.site, 'dated', row._id, new Set())
  await ctx.db.delete(row._id)
}

/** What a checked dated save or publish writes: the row of that day (new or merged) and the values around it. */
export interface DatedPlan {
  from: string
  /** The row of the same day that it merges into. */
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
 * Checks a dated change of `entry` and merges it into the row of the same day (D125): `set` holds root fields in storage
 * format (null clears). The check of D119 runs on the entry with every waiting change up to that day applied, and only
 * the problems of this change refuse it; then the files and the links it adds (a draft planned for that day counts as
 * online), the entry's budget with every waiting change applied, and at most `MAX_DATED` waiting changes. A field given
 * with the value it already has on that day leaves the row; `fields` empty means nothing waits for that day any more.
 */
export async function planDated(ctx: QueryCtx, site: Doc<'sites'>, entry: Doc<'entries'>, from: string, set: Record<string, Json>, rows: readonly Dated[]): Promise<DatedPlan> {
  const schema = site.schema as Schema
  const brick = schema.bricks[entry.brick]!
  const same = rows.find((r) => r.from === from)
  const others = rows.filter((r) => r !== same)
  const live = entry.data as Data
  const before = dataOn(live, asChanges(others), from)
  const fields: Record<string, Json> = { ...(same?.fields as Record<string, Json> | undefined) }
  const roots = Object.keys(set)
  for (const root of roots) {
    if (sameValue(set[root], before[root])) delete fields[root]
    else fields[root] = set[root] ?? null
  }
  const after = dataOn(before, [{ from, set: fields }], from)
  const main = schema.locales[0]!
  const keys = Object.keys(fields)
  const kept = Object.fromEntries(Object.entries(same?.prints ?? {}).filter(([leaf]) => !roots.some((r) => underRoot(leaf, r))))
  const fresh = nextPrints({ fields: brick.fields, roots, before, after, prints: entry.prints as Prints, main, confirm: undefined })
  const prints: Prints = { ...kept, ...Object.fromEntries(Object.entries(fresh).filter(([leaf]) => roots.some((r) => keys.includes(r) && underRoot(leaf, r)))) }
  const pick = (d: Data) => Object.fromEntries(roots.filter((r) => d[r] !== undefined).map((r) => [r, d[r]!]))
  const plan: DatedPlan = { from, same, fields, prints, roots, before: pick(before), after: pick(after) }
  if (!keys.length) return plan

  const changes: Change[] = [...asChanges(others), { from, set: fields }]
  const issues = (await changeIssues(schema, entry.brick, live, changes, await lookupsFor(ctx, site._id, brick.fields, after))).filter((i) => i.change === changes.length - 1)
  if (issues.length) fail('INVALID', 'errors.pleaseCheckMarkedFields', undefined, { errors: issues.map(({ change: _, ...issue }) => issue) as unknown as Json })
  await checkNewFiles(ctx, site._id, brick.fields, before, after)
  await checkNewLinks(ctx, site, [{ entry, fields: brick.fields, before, after }], dayStart(from, schema.timeZone))
  // Every waiting change applied: the entry as it will be after its last day must still fit.
  const last = dataOn(live, changes, '9999-12-31')
  const bytes = entryBytes(last, { ...(entry.prints as Prints), ...prints })
  if (!fitsBudget(bytes, entry.bytes, BUDGET.entryBytes)) fail('TOO_LARGE', 'errors.entryTooLarge', overBudget(bytes, BUDGET.entryBytes))
  if (!same && others.filter((r) => !r.stopped).length >= MAX_DATED) fail('TOO_LARGE', 'errors.tooManyDated', { max: MAX_DATED })
  return plan
}

/**
 * Writes a checked plan: the row of its day (merged: `by` becomes this person, a stop is cleared and its run planned
 * again), its run at the first minute of the day, its file references, the history row (`kind: 'dated'`) and, when it
 * touches a field of `timeline.public`, a new `contentRev`. An empty plan drops the row of that day. The entry is not
 * touched. `revs`: the entry rev each given root was saved at.
 */
export async function writeDated(ctx: MutationCtx, actor: Actor, entry: Doc<'entries'>, plan: DatedPlan, revs: Record<string, number>, history: Recorded, opId: string) {
  const site = actor.site
  const schema = site.schema as Schema
  const now = Date.now()
  const touched = [...new Set([...plan.roots, ...Object.keys(plan.same?.fields ?? {})])]
  let id: Id<'datedChanges'> | undefined
  if (!Object.keys(plan.fields).length) {
    if (plan.same) await dropDated(ctx, plan.same)
  } else {
    const keptRevs = Object.fromEntries(Object.entries(plan.same?.revs ?? {}).filter(([root]) => Object.hasOwn(plan.fields, root)))
    const row = { fields: plan.fields, prints: plan.prints, revs: { ...keptRevs, ...Object.fromEntries(plan.roots.filter((r) => Object.hasOwn(plan.fields, r)).map((r) => [r, revs[r] ?? entry.rev])) }, by: actor.user.id, at: now }
    if (plan.same) {
      id = plan.same._id
      await ctx.db.patch(id, { ...row, stopped: undefined })
      if (!plan.same.job) await ctx.db.patch(id, { job: await ctx.scheduler.runAt(dayStart(plan.from, schema.timeZone), internal.datedChanges.applyDue, { change: id, from: plan.from }) })
    } else {
      id = await ctx.db.insert('datedChanges', { site: site._id, entry: entry._id, brick: entry.brick, from: plan.from, ...row })
      await ctx.db.patch(id, { job: await ctx.scheduler.runAt(dayStart(plan.from, schema.timeZone), internal.datedChanges.applyDue, { change: id, from: plan.from }) })
    }
    await syncDatedRefs(ctx, schema, { _id: id, site: site._id, brick: entry.brick, fields: plan.fields })
  }
  const contentRev = touchesPublic(schema, entry.brick, touched) ? site.contentRev + 1 : site.contentRev
  if (contentRev !== site.contentRev) await ctx.db.patch(site._id, { contentRev })
  const change = await ctx.db.insert('changes', {
    site: site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId, kind: 'dated', ...history,
    entryRev: entry.rev, contentRev, at: now,
  })
  return { dated: id, change, contentRev }
}
