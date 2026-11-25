// Dated changes (D125–D127): moving one to another day, cancelling it, listing an entry's for the editor, and the run
// on its day that writes it into the entry. Making one is `entries.save` or `entries.publish` with `from` (entries.ts).
import type { Brick, Json } from '@lupinum/ginko'
import { changeRefusal, entryBytes, isDate, todayIn, validate, type Schema } from '@lupinum/ginko/internal'
import { ConvexError, v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { actorFor, authorize, byOf, entryOf, fail, idempotent, SYSTEM, taskBrickOf, type Actor } from './lib/access'
import type { Data, Prints } from './lib/content'
import { checkDay, datedOf, dayStart, dropDated, fieldNames, insertWaiting, planDated, refuseTaskWithoutDay, syncDatedRefs, touchesPublic, writeDated, type Dated } from './lib/dated'
import { msg, recorded } from './lib/history'
import { entryLabel } from './lib/list'
import { labeler } from './lib/names'
import { dropPending, dropPendingRoots, overlay, pendingOf, underRoot } from './lib/pending'
import { needsProposal } from './lib/policy'
import { errorKind, mailStoppedChange, stoppedBecause, writeStop } from './lib/stopped'
import { brokenNewLinks, commitEntry, lookupsFor } from './lib/write'
import type { StopReason } from './schema'
import { internal } from './_generated/api'
import { advance, clearSkipped, eachSite, notConverted, stepArgs } from './lib/migrations'
import { followName, publishHeldNow, rootsWith, writeFollowedName } from './entries'

/** A dated change of the actor's site, and its entry; anything else is NOT_FOUND. */
async function datedRow(ctx: QueryCtx, actor: Actor, id: string): Promise<{ row: Dated; entry: Doc<'entries'> }> {
  const normalized = ctx.db.normalizeId('datedChanges', id)
  const row = normalized ? await ctx.db.get(normalized) : null
  if (!row || row.site !== actor.site._id) fail('NOT_FOUND', 'errors.datedNotFound')
  return { row, entry: await entryOf(ctx, actor, row.entry) }
}

/**
 * Who may move or cancel a dated change (D125): who may make it, with the same task (`when: { from: 'ask' }`) or the full
 * rights of the brick, and the owners and admins.
 */
function mayChange(actor: Actor, schema: Schema, task: string | undefined, entry: Doc<'entries'>, row: Dated) {
  if (actor.role !== 'staff') return
  refuseTaskWithoutDay(schema, task)
  authorize(actor, schema, { task, brick: taskBrickOf(schema, task, entry), kind: 'edit', fields: Object.keys(row.fields), entry })
}

/**
 * Why `actor` may not take `step` on `row` through `task`, as the error the step throws; undefined when it may. One rule
 * for `cancel`, `setDay` and the list the editor reads (G7): the task's rights over the change's fields; and a person
 * whose change needs a yes moves none and cancels only their own (taking away someone else's planned values needs one):
 * a row they saved last that holds no one else's values (`shared`, H2). On a draft nothing needs a yes, as for a save on a
 * draft (`needsProposal`), so this last rule does not apply there.
 */
async function datedRefusal(ctx: QueryCtx, actor: Actor, schema: Schema, task: string | undefined, entry: Doc<'entries'>, row: Dated, step: 'cancel' | 'move'): Promise<ConvexError<Json> | undefined> {
  try {
    mayChange(actor, schema, task, entry, row)
    if (step === 'move' && entry.deletedAt) fail('NOT_FOUND', 'errors.datedNotFound')
    if ((step === 'move' || row.by !== actor.user.id || row.shared) && await needsProposal(ctx, actor, 'save', task, taskBrickOf(schema, task, entry), entry)) fail('FORBIDDEN', 'errors.needsApprovalProposeAgain')
    return undefined
  } catch (error) {
    if (error instanceof ConvexError) return error as ConvexError<Json>
    throw error
  }
}

/**
 * Moves a dated change to another day, checked at that day as a new one (a value may fit one day and not another); a
 * change that stopped starts again. A change already waiting on that day takes the moved fields (they replace its
 * values). A person whose change needs a yes cancels and makes it again instead, so the yes is not passed by.
 */
export const setDay = mutation({
  args: { site: v.string(), opId: v.string(), task: v.optional(v.string()), change: v.string(), from: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    return idempotent(ctx, actor, args, async () => {
      const { row, entry } = await datedRow(ctx, actor, args.change)
      const schema = actor.site.schema as Schema
      const refused = await datedRefusal(ctx, actor, schema, args.task, entry, row, 'move')
      if (refused) throw refused
      checkDay(schema, args.from)
      const result: Json = { change: row._id, from: args.from, contentRev: actor.site.contentRev }
      if (args.from === row.from && !row.stopped) return result
      const rows = (await datedOf(ctx, entry._id)).filter((r) => r._id !== row._id)
      const plan = await planDated(ctx, actor.site, entry, args.from, row.fields as Record<string, Json>, rows)
      const title = entryLabel(schema, entry.brick, entry.data as Data)
      const history = recorded(msg('history.datedMoved', { title, fields: fieldNames(schema, entry.brick, Object.keys(row.fields)), was: dayStart(row.from, schema.timeZone), day: dayStart(args.from, schema.timeZone) }), schema)
      if (plan.same || !Object.keys(plan.fields).length) {
        // Into the change of that day, or nothing left that differs on that day: the moved row goes.
        await dropDated(ctx, row)
        const written = await writeDated(ctx, actor, entry, plan, row.revs, [{ kind: 'dated', history }], args.opId)
        // The moved values are someone else's (or already several people's): the merged row holds them too (I2).
        if (written.dated && (row.shared || row.by !== actor.user.id)) await ctx.db.patch(written.dated, { shared: true })
        return { change: written.dated ?? null, from: args.from, contentRev: written.contentRev }
      }
      if (row.job) await ctx.scheduler.cancel(row.job)
      await ctx.db.patch(row._id, { from: args.from, fields: plan.fields, prints: plan.prints, stopped: undefined, job: undefined })
      await ctx.db.patch(row._id, { job: await ctx.scheduler.runAt(dayStart(args.from, schema.timeZone), internal.datedChanges.applyDue, { change: row._id, from: args.from }) })
      // A field that holds its online value on the new day left the change, and with it the hold on its files.
      await syncDatedRefs(ctx, schema, { _id: row._id, site: row.site, brick: row.brick, fields: plan.fields })
      const contentRev = touchesPublic(schema, entry.brick, Object.keys(row.fields)) ? actor.site.contentRev + 1 : actor.site.contentRev
      if (contentRev !== actor.site.contentRev) await ctx.db.patch(actor.site._id, { contentRev })
      await ctx.db.insert('changes', {
        site: actor.site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId: args.opId, kind: 'dated', ...history,
        entryRev: entry.rev, contentRev, at: Date.now(),
      })
      return { change: row._id, from: args.from, contentRev }
    })
  },
})

/**
 * Cancels a dated change, waiting or stopped: its values never come, the entry stays as it is. A person whose change
 * needs a yes may cancel their own change only: taking away someone else's planned values is a change that needs one.
 */
export const cancel = mutation({
  args: { site: v.string(), opId: v.string(), task: v.optional(v.string()), change: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    return idempotent(ctx, actor, args, async () => {
      const { row, entry } = await datedRow(ctx, actor, args.change)
      const schema = actor.site.schema as Schema
      const refused = await datedRefusal(ctx, actor, schema, args.task, entry, row, 'cancel')
      if (refused) throw refused
      await dropDated(ctx, row)
      // A stopped change was no longer served as coming.
      const contentRev = !row.stopped && touchesPublic(schema, entry.brick, Object.keys(row.fields)) ? actor.site.contentRev + 1 : actor.site.contentRev
      if (contentRev !== actor.site.contentRev) await ctx.db.patch(actor.site._id, { contentRev })
      const title = entryLabel(schema, entry.brick, entry.data as Data)
      const change = await ctx.db.insert('changes', {
        site: actor.site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId: args.opId, kind: 'datedCancelled',
        ...recorded(msg('history.datedCancelled', { title, day: dayStart(row.from, schema.timeZone), fields: fieldNames(schema, entry.brick, Object.keys(row.fields)) }), schema),
        entryRev: entry.rev, contentRev, at: Date.now(),
      })
      const result: Json = { change, contentRev }
      return result
    })
  },
})

/**
 * An entry's dated changes for the editor, in the order of their days: the values in storage format, who saved into it
 * last and when, whether the person may cancel and move it through `task`, a stop, and `changedSince`: the fields whose normal value was written after the change was made (the
 * change still wins on its day, D126).
 */
export const list = query({
  args: { site: v.string(), entry: v.string(), task: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const entry = await entryOf(ctx, actor, args.entry)
    const schema = actor.site.schema as Schema
    const names = await labeler(ctx, actor)
    const out = []
    for (const row of await datedOf(ctx, entry._id)) {
      out.push({
        id: row._id, from: row.from, fields: Object.keys(row.fields), values: row.fields, by: row.by ? await names.who(row.by) : null, at: row.at,
        // What `task` lets this person do with it (G7): the editor offers only these steps.
        mayCancel: !(await datedRefusal(ctx, actor, schema, args.task, entry, row, 'cancel')),
        mayMove: !(await datedRefusal(ctx, actor, schema, args.task, entry, row, 'move')),
        ...(row.stopped ? { stopped: row.stopped } : {}),
        changedSince: Object.keys(row.fields).filter((root) => (entry.fieldRevs[root] ?? 0) > (row.revs[root] ?? 0)),
      })
    }
    return out
  },
})

/**
 * The run of a dated change at the first minute of its day (D126). It does nothing when the change is gone, moved, stopped
 * or the site is being deleted; it plans itself again while the site's today is still before the day (the zone moved).
 * Then it checks the entry with the values of the change (`dueRefusal`) and stops with the reason (D127), or writes them
 * (`writeDue`). Any other error of the run stops the change with `failed`, so it never fails silently.
 */
export const applyDue = internalMutation({
  args: { change: v.id('datedChanges'), from: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db.get(args.change)
    if (!row || row.from !== args.from || row.stopped) return null
    const site = await ctx.db.get(row.site)
    if (!site || site.deleting) return null
    const entry = await ctx.db.get(row.entry)
    if (!entry || entry.deletedAt) return null
    const schema = site.schema as Schema
    if (todayIn(schema.timeZone) < row.from) {
      // Never sooner than a minute from now: a start that has passed would run again at once, again and again.
      const at = Math.max(dayStart(row.from, schema.timeZone), Date.now() + 60_000)
      await ctx.db.patch(row._id, { job: await ctx.scheduler.runAt(at, internal.datedChanges.applyDue, { change: row._id, from: row.from }) })
      return null
    }
    const title = entryLabel(schema, entry.brick, entry.data as Data)
    let reason: StopReason | undefined
    let writing = false
    try {
      reason = await dueRefusal(ctx, site, entry, row)
      writing = true
      if (!reason) await ctx.runMutation(internal.datedChanges.writeDue, { change: row._id })
    } catch (error) {
      // A refusal of the write (a budget the site reached since) stops it as `invalid` with that refusal as its cause; the
      // class survives `runMutation`. Any other error of the run stops the change with `failed` (`writeStop`);
      // `writeDue` is a transaction of its own, so nothing of it stays written.
      reason = writing ? writeStop(error, Object.keys(row.fields)) : { code: 'failed' }
      if (reason.code === 'failed') console.error(`Dated change ${row._id} failed (${errorKind(error)}).`)
    }
    return reason ? await stop(ctx, site, entry, row, reason, title) : null
  },
})

/**
 * Why a due change cannot be written (D127), or nothing: a field gone or one a change may no longer set, a value that
 * no longer fits, a new link that leads nowhere. Reads only.
 */
async function dueRefusal(ctx: QueryCtx, site: Doc<'sites'>, entry: Doc<'entries'>, row: Dated): Promise<StopReason | undefined> {
  const schema = site.schema as Schema
  const roots = Object.keys(row.fields)
  const brick = Object.hasOwn(schema.bricks, entry.brick) ? schema.bricks[entry.brick] : undefined
  const gone = roots.filter((root) => !brick || brick.retired || changeRefusal(schema, brick, root) !== undefined)
  if (gone.length || !brick) return { code: 'invalid', fields: gone }
  const { data } = overlay(entry, row)
  const { errors } = await validate(schema, entry.brick, data, { mode: 'patch', changed: new Set(roots), ...(await lookupsFor(ctx, site._id, brick.fields, data)) })
  if (errors.length) return { code: 'invalid', fields: [...new Set(errors.map((e) => e.path))] }
  const broken = await brokenNewLinks(ctx, site, [{ entry, fields: brick.fields, before: entry.data as Data, after: data }], dayStart(row.from, schema.timeZone))
  if (broken) return { code: 'link', href: broken.href }
  return undefined
}

/**
 * The write of a due change once `dueRefusal` passed, as a transaction of its own (an error rolls all of it back): the
 * values through `commitEntry` as the system, into an online entry or a draft, also when a field was edited since (a
 * draft whose name is not fixed follows its new title, as for a save); the history names the planner, and the row goes.
 */
export const writeDue = internalMutation({
  args: { change: v.id('datedChanges') },
  handler: async (ctx, args): Promise<null> => {
    const row = (await ctx.db.get(args.change))!
    const site = (await ctx.db.get(row.site))!
    const entry = (await ctx.db.get(row.entry))!
    const schema = site.schema as Schema
    const roots = Object.keys(row.fields)
    const brick = schema.bricks[entry.brick]!
    const { data, prints } = overlay(entry, row)
    const actor: Actor = { user: { id: SYSTEM.actor }, site, role: 'admin', grants: [] }
    // A new title of a draft whose name is not fixed yet renames it, as a save does.
    const followed = await followName(ctx, actor, entry, brick, entry.data as Data, data)
    const written = await commitEntry(ctx, {
      actor, entry, fields: brick.fields, roots: rootsWith(roots, brick, followed), data, prints, kind: 'save', opId: `dated:${row._id}`,
      history: recorded(msg('history.datedApplied', { title: entryLabel(schema, entry.brick, entry.data as Data), fields: fieldNames(schema, entry.brick, roots), day: dayStart(row.from, schema.timeZone) }), schema),
    })
    if (followed) await writeFollowedName(ctx, actor, entry, followed)
    if (row.by) await ctx.db.patch(written.change, { plannedBy: row.by })
    await dropDated(ctx, row, true)
    return null
  },
})

/**
 * A dated change that did not take effect (D127): nothing is written, the row keeps why and loses its run, the history says
 * it, and the person who made it and the owners are told. A failed mail never undoes the stop. It is not tried again.
 */
async function stop(ctx: MutationCtx, site: Doc<'sites'>, entry: Doc<'entries'>, row: Dated, reason: StopReason, title: string): Promise<null> {
  const schema = site.schema as Schema
  const day = dayStart(row.from, schema.timeZone)
  const roots = Object.keys(row.fields)
  await ctx.db.patch(row._id, { stopped: { at: day, reason }, job: undefined })
  try {
    await mailStoppedChange(ctx, site, entry, row.by, { brick: entry.brick, title, day, fields: roots, reason })
  } catch (error) {
    console.error(`Mail stopped ${entry._id} not queued (${errorKind(error)}).`)
  }
  // The values no longer come, so a page stops reading them ahead.
  const contentRev = touchesPublic(schema, entry.brick, roots) ? site.contentRev + 1 : site.contentRev
  if (contentRev !== site.contentRev) await ctx.db.patch(site._id, { contentRev })
  await ctx.db.insert('changes', {
    site: site._id, entry: entry._id, brick: entry.brick, ...SYSTEM, opId: `dated:${row._id}`, kind: 'datedStopped',
    ...recorded(msg('history.datedStopped', { title, day, why: stoppedBecause(schema, entry.brick, reason) }), schema),
    ...(row.by ? { plannedBy: row.by } : {}), entryRev: entry.rev, contentRev, at: Date.now(),
  })
  return null
}

/**
 * The migration `2026-11-25-dated-changes` (D130), one site per page. What planned values for a later time with the
 * older ways becomes after this release:
 * - Unpublished changes with a time (`pendingChanges.publishAt`): its run is cancelled. A day after today becomes a
 *   dated change of that day (checked like "Publish on a day", planner = who saved them); today or a past day goes
 *   online now (like "Publish", planner on the history row). When the check refuses it, or anything else fails for
 *   that row, the changes stay unpublished without a time, with a history line.
 * - A single request approved for a time (status `scheduled`, no release): its run is cancelled and it is open again,
 *   so an approver decides it anew. Release members keep their schedule.
 * - A brick with `planned` in the stored schema: per entry, a planned value whose day is after today becomes a dated
 *   change (without a person, like an import), one whose day has come is written into the field, and the two plan
 *   fields go from the data. The stored schema loses `planned` and the two fields (also in tasks), gains
 *   `timeline: { public: [field] }`, and a task that showed the plan gets `when: { from: 'ask' }` when a change may set
 *   all its fields. `schemaRev` and `contentRev` rise.
 * It reads the stored model as it is, never through the new `checkSchema` (which refuses `planned`). Safe to run again:
 * a site without these has nothing to do. Each site is a transaction of its own: one it cannot convert is reported by
 * its slug (`ops:status`), and the others go on.
 */
export const migrateOlderWays = internalMutation({
  args: stepArgs,
  handler: async (ctx, args): Promise<null> => {
    const page = await ctx.db.query('sites').paginate({ cursor: args.cursor, numItems: 1 })
    for (const site of page.page) await eachSite(ctx, args.run, site, () => ctx.runMutation(internal.datedChanges.migrateOneSite, { site: site._id }))
    return advance(ctx, args.run, page.isDone ? null : page.continueCursor)
  },
})

const MIGRATION = '2026-11-25-dated-changes'

/**
 * One site of `migrateOlderWays`, as a transaction of its own (`eachSite`). Also the rerun of a skipped site, by hand
 * (internals/migrations.md): when it succeeds, the site leaves `migrations.skipped`.
 */
export const migrateOneSite = internalMutation({
  args: { site: v.id('sites') },
  handler: async (ctx, args): Promise<null> => {
    const site = await ctx.db.get(args.site)
    try {
      if (site) await migrateSite(ctx, site)
    } catch (error) {
      throw notConverted(error)
    }
    await clearSkipped(ctx, MIGRATION, args.site)
    return null
  },
})

/** Cancels a job only while it still waits: one that ran, failed or was cancelled keeps its state in `_scheduled_functions`. */
async function cancelWaiting(ctx: MutationCtx, job: Id<'_scheduled_functions'>) {
  if ((await ctx.db.system.get(job))?.state.kind === 'pending') await ctx.scheduler.cancel(job)
}

/**
 * One site: first the `planned` rules (the model converts), then the timed unpublished changes, checked with the
 * converted model, then the requests approved for a time.
 */
async function migrateSite(ctx: MutationCtx, site: Doc<'sites'>) {
  await convertPlanned(ctx, site)
  const converted = (await ctx.db.get(site._id))!
  await convertTimed(ctx, converted)
  await reopenTimedRequests(ctx, (await ctx.db.get(site._id))!)
}

/**
 * Unpublished changes with a time (`pendingChanges.publishAt`): the time goes, then each row is converted on its own
 * (`migrateTimedRow`). A row that cannot be converted, for any reason, stays unpublished without a time, with a history
 * line; the site goes on.
 */
async function convertTimed(ctx: MutationCtx, site: Doc<'sites'>) {
  const schema = site.schema as Schema
  for (const held of await ctx.db.query('pendingChanges').withIndex('by_site', (q) => q.eq('site', site._id)).collect()) {
    if (held.publishAt === undefined) continue
    if (held.publishJob) await cancelWaiting(ctx, held.publishJob)
    const publishAt = held.publishAt
    await ctx.db.patch(held._id, { publishAt: undefined, publishJob: undefined })
    const entry = await ctx.db.get(held.entry)
    if (!entry || entry.deletedAt) continue
    try {
      await ctx.runMutation(internal.datedChanges.migrateTimedRow, { held: held._id, publishAt })
    } catch (error) {
      const data = error instanceof ConvexError ? error.data as { code?: string; kind?: string } : undefined
      if (data?.code === 'NOT_CONVERTED') console.error(`Migration ${MIGRATION}: unpublished changes ${held._id} stay without a time (${data.kind}).`)
      const current = (await ctx.db.get(site._id))!
      await ctx.db.insert('changes', {
        site: site._id, entry: entry._id, brick: entry.brick, ...SYSTEM, opId: migrateOpId(held._id), kind: 'unschedule',
        ...recorded(msg('history.changesUnscheduled', { title: titleOr(schema, entry) }), schema), entryRev: entry.rev, contentRev: current.contentRev, at: Date.now(),
      })
    }
  }
}

const migrateOpId = (id: string) => `migrate:dated-changes:${id}`

/** The entry's title, or its brick's key where the stored model cannot give one (an old model). */
function titleOr(schema: Schema, entry: Doc<'entries'>): string {
  try {
    return entryLabel(schema, entry.brick, entry.data as Data)
  } catch {
    return entry.brick
  }
}

/**
 * One timed unpublished change of the migration, as a transaction of its own, so a row that fails leaves nothing half
 * written. Its time's day in the site's zone decides (a time of day becomes the start of that day): a later day becomes
 * a dated change of that day, planned by who saved the changes; today or a past day goes online now as "Publish" does,
 * with the planner on the history row. A check that refuses throws, and the caller keeps the changes unpublished.
 */
export const migrateTimedRow = internalMutation({
  args: { held: v.id('pendingChanges'), publishAt: v.number() },
  handler: async (ctx, args): Promise<null> => {
    try {
      await convertTimedRow(ctx, args.held, args.publishAt)
    } catch (error) {
      // A refusal (ConvexError) keeps its code; any other error loses its class on the way out, so it goes as data.
      throw error instanceof ConvexError ? error : notConverted(error)
    }
    return null
  },
})

async function convertTimedRow(ctx: MutationCtx, id: Id<'pendingChanges'>, publishAt: number) {
  const held = (await ctx.db.get(id))!
  const site = (await ctx.db.get(held.site))!
  const entry = (await ctx.db.get(held.entry))!
  const schema = site.schema as Schema
  const day = todayIn(schema.timeZone, new Date(publishAt))
  const actor: Actor = { user: { id: SYSTEM.actor }, site, role: 'admin', grants: [] }
  // Its day has come (also between the deploy and this step): online now, as "Publish" does, in the planner's name.
  if (day <= todayIn(schema.timeZone)) {
    const written = await publishHeldNow(ctx, actor, entry, held, migrateOpId(held._id))
    await ctx.db.patch(written.change, { plannedBy: held.by })
    return
  }
  const roots = Object.keys(held.fields)
  if (roots.some((root) => changeRefusal(schema, schema.bricks[entry.brick]!, root))) throw new ConvexError({ code: 'INVALID' })
  // A field changed online since the save (also by a passed plan of this migration): refused, as "Publish" with a day
  // refuses it (`publishPendingDated`).
  if (roots.some((root) => (entry.fieldRevs[root] ?? 0) > (held.revs[root] ?? 0))) throw new ConvexError({ code: 'CHANGED_SINCE' })
  const rows = await datedOf(ctx, entry._id)
  // The row of that day already sets one of these fields (a planned value converted above, or a dated change saved
  // since the deploy): neither value may silently win, so the change stays unpublished without a time.
  const sameDay = rows.find((row) => row.from === day)
  if (sameDay && roots.some((root) => Object.hasOwn(sameDay.fields as object, root))) throw new ConvexError({ code: 'INVALID' })
  const words = { title: titleOr(schema, entry), fields: fieldNames(schema, entry.brick, roots), day: dayStart(day, schema.timeZone) }
  const plan = await planDated(ctx, site, entry, day, held.fields as Record<string, Json>, rows)
  const written = await writeDated(ctx, actor, entry, plan, held.revs, [{ kind: 'dated', history: recorded(msg('history.datedFromPending', words), schema) }], migrateOpId(held._id))
  if (written.dated) await ctx.db.patch(written.dated, { by: held.by })
  await dropPending(ctx, held)
}

/**
 * Single requests approved for a time: open again, so an approver decides them anew, with one history line on the
 * entry that names the time. Release members keep theirs.
 */
async function reopenTimedRequests(ctx: MutationCtx, site: Doc<'sites'>) {
  const schema = site.schema as Schema
  for (const p of await ctx.db.query('proposals').withIndex('by_site_status', (q) => q.eq('site', site._id).eq('status', 'scheduled')).collect()) {
    if (p.release) continue
    if (p.job) await cancelWaiting(ctx, p.job)
    await ctx.db.patch(p._id, { status: 'open', at: undefined, job: undefined, decidedBy: undefined, decidedAt: undefined })
    const entry = p.entry ? await ctx.db.get(p.entry) : null
    if (!entry || p.at === undefined) continue
    await ctx.db.insert('changes', {
      site: site._id, entry: entry._id, brick: entry.brick, ...SYSTEM, opId: migrateOpId(p._id), kind: 'requestReopened',
      ...recorded(msg('history.requestReopened', { title: titleOr(schema, entry), at: p.at }), schema), entryRev: entry.rev, contentRev: site.contentRev, at: Date.now(),
    })
  }
}

/** The `planned` rules of the stored model and the plan fields of each entry. */
async function convertPlanned(ctx: MutationCtx, site: Doc<'sites'>) {
  const schema = site.schema as Schema
  const today = todayIn(schema.timeZone)
  const planned = Object.entries(schema.bricks).flatMap(([key, brick]) => {
    const rule = (brick as { planned?: { field: string; next: string; from: string } }).planned
    return rule ? [{ key, rule }] : []
  })
  if (!planned.length) return
  const next = structuredClone(schema)
  // The plan fields leave each entry's text, so the site's byte counters shrink with them (online and in the trash).
  let bytes = 0
  let trashBytes = 0
  for (const { key, rule } of planned) {
    for (const entry of await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id).eq('brick', key)).collect()) {
      // One line for a plan that goes, so the person learns it is gone and plans it again.
      const dropLine = (id: string, roots: string[]) => ctx.db.insert('changes', {
        site: site._id, entry: entry._id, brick: entry.brick, ...SYSTEM, opId: `${migrateOpId(id)}:plan`, kind: 'planDropped',
        ...recorded(msg('history.planDropped', { title: titleOr(schema, entry), fields: fieldNames(schema, entry.brick, roots) }), schema), entryRev: entry.rev, contentRev: site.contentRev, at: Date.now(),
      })
      // An unpublished change of a plan field goes with the field, also on an entry without a plan.
      const held = await pendingOf(ctx, entry._id)
      const dropped = held ? [rule.next, rule.from].filter((root) => Object.hasOwn(held.fields, root)) : []
      if (held && dropped.length) {
        await dropPendingRoots(ctx, schema, held, dropped)
        await dropLine(held._id, dropped)
      }
      const data = { ...(entry.data as Data) }
      if (!Object.hasOwn(data, rule.next) && !Object.hasOwn(data, rule.from)) continue
      const value = data[rule.next]
      const day = data[rule.from]
      delete data[rule.next]
      delete data[rule.from]
      // A plan day that is no date (an empty text, a phrase) is no plan: the two plan fields go, the value is not written,
      // and a value that was set gets its line (I2).
      const set = value !== undefined && value !== null
      const planned = set && isDate(day)
      if (set && !planned) await dropLine(entry._id, [rule.next])
      if (planned && day <= today) data[rule.field] = value
      const fieldRevs = { ...(entry.fieldRevs as Record<string, number>) }
      for (const name of [...(planned && day <= today ? [rule.field] : []), rule.next, rule.from]) fieldRevs[name] = (fieldRevs[name] ?? 0) + 1
      const prints = Object.fromEntries(Object.entries(entry.prints as Prints).filter(([leaf]) => !underRoot(leaf, rule.next) && !underRoot(leaf, rule.from)))
      const size = entryBytes(data, prints)
      if (entry.deletedAt) trashBytes += size - entry.bytes
      else bytes += size - entry.bytes
      await ctx.db.patch(entry._id, { data, prints, fieldRevs, rev: entry.rev + 1, bytes: size, contentAt: Date.now() })
      if (planned && day > today && !entry.deletedAt) await insertWaiting(ctx, schema, { ...entry, rev: entry.rev + 1 }, [{ from: day, set: { [rule.field]: value } }])
    }
    const brick = next.bricks[key]! as Brick & { planned?: unknown }
    delete brick.planned
    delete brick.fields[rule.next]
    delete brick.fields[rule.from]
    brick.timeline = { public: [...new Set([...(brick.timeline?.public ?? []), rule.field])] }
    brick.tasks = brick.tasks?.map((task) => {
      if (task.kind === 'remove') return task
      const showedPlan = task.fields?.includes(rule.next) ?? false
      const fields = task.fields?.filter((name) => name !== rule.next && name !== rule.from)
      const datable = task.kind === 'edit' && showedPlan && !task.when && fields!.every((name) => !changeRefusal(next, brick, name))
      return { ...task, ...(fields ? { fields } : {}), ...(datable ? { when: { from: 'ask' as const } } : {}) }
    })
  }
  const fresh = (await ctx.db.get(site._id))!
  await ctx.db.patch(site._id, {
    schema: next as unknown as Json, schemaRev: fresh.schemaRev + 1, contentRev: fresh.contentRev + 1,
    bytes: fresh.bytes + bytes, trashBytes: (fresh.trashBytes ?? 0) + trashBytes,
  })
}
