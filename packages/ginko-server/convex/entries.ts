// Entry operations (SPEC 4.2). `save` is the reference for the shared flow of SPEC 4.1:
// actor → repeated op → load → may they → precondition → check → write → record op.
import type { Brick, CollectionBrick, Field, Fields, Json, Label, Locale } from '@lupinum/ginko'
import { blockedSlugs, effectiveMax, entryBytes, isTranslatable, labelOf as labelIn, leavesOf, listHaystack, listSort, deletesExpired, isVisible, liveFrom, ordered, resolveToken, searchable, sha256, slugBases, slugify, sortEntries, SITE_BUDGET, todayIn, uniqueSlug, urlsFor, validate, visibleUntil, weeklyTask, type Schema, type StoredEntry } from '@lupinum/ginko/internal'
import { paginationOptsValidator } from 'convex/server'
import { v, type ObjectType } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { actorFor, authorize, authorizeWriter, byOf, checkRev, createdBy, entryOf, fail, idempotent, SYSTEM, taskBrickOf, type Actor, type By } from './lib/access'
import { fieldLabelAt, fileIdsOf, mergeField, nextPrints, refIdsIn, rootOf, treesOf, withoutLocale, type Data, type Prints } from './lib/content'
import { labeler, type Who } from './lib/names'
import { msg, recorded, undoBlockOf, type HistoryMsg, type Recorded } from './lib/history'
import { DEFAULT_LOCALE, isLocale, t } from './lib/i18n'
import { countersOf, DELETED_KEPT, overflowingTrash, purgeEntry, softRemove, storageSums, writeCounters, type Counters } from './lib/lifecycle'
import { directWriteRefused, needsProposal, propose, refuseAgentUndo, refuseDirectWrite } from './lib/policy'
import { publicness } from './lib/publicness'
import { translationNotes } from './lib/translation'
import { taskFor } from './lib/agentTools'
import { BUDGET, checkFiles, checkNewFiles, brokenNewLinks, checkNewLinks, commitEntry, entryUses, lookupsFor, overBudget, same, sizeText, syncEntryRefs, syncFileRefs, untrashFilesOf, uploadIdsOf } from './lib/write'
import { putTrees, readTreesJson } from './lib/trees'
import { editorEntry, editorEntryWithTranslation, listRow, slimEntry, titleOf } from './lib/list'
import { diffFields, localeDiffs } from './lib/diff'

const underRoot = (leaf: string, root: string) => leaf === root || leaf.startsWith(`${root}.`)

function liveField(brick: Schema['bricks'][string], key: string): Field {
  const field = Object.hasOwn(brick.fields, key) ? brick.fields[key] : undefined
  if (!field || field.retired) fail('INVALID', 'errors.fieldNoLongerExists', { key }, { field: key })
  return field
}

function brickOf(schema: Schema, entry: Doc<'entries'>) {
  const brick = Object.hasOwn(schema.bricks, entry.brick) ? schema.bricks[entry.brick] : undefined
  if (!brick || brick.retired) fail('INVALID', 'errors.brickNoLongerEditable')
  return brick
}

function current(entry: Doc<'entries'>): Json {
  return { entry: entry._id, rev: entry.rev, data: entry.data as Json, fieldRevs: entry.fieldRevs, deleted: !!entry.deletedAt }
}

/**
 * Who made the newest change of each conflicting root, for the conflict panel ("anna@… hat „…“ hinzugefügt").
 * Only the changes after the person's base are read, newest first, and only on this failing path.
 */
async function conflictAuthors(ctx: QueryCtx, actor: Actor, entry: Doc<'entries'>, roots: string[], baseRev: number): Promise<Record<string, Who>> {
  const names = await labeler(ctx, actor)
  const by: Record<string, Who> = {}
  const open = new Set(roots)
  for await (const change of ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry._id)).order('desc')) {
    if (!open.size || (change.entryRev !== undefined && change.entryRev <= baseRev)) break
    for (const root of change.fields ?? []) {
      if (!open.delete(root)) continue
      by[root] = await names.who(change.actor)
    }
  }
  return by
}

const saveArgs = {
  site: v.string(),
  opId: v.string(),
  task: v.optional(v.string()),
  entry: v.string(),
  baseRev: v.number(),
  /** Root field → value in storage format, or null to remove an optional field. A list is one field. */
  fields: v.record(v.string(), v.any()),
  /** Replace translatable values only in this locale; required with `confirm`. */
  locale: v.optional(v.string()),
  /** Leaf paths whose outdated translation in `locale` stays as is and counts as fresh. */
  confirm: v.optional(v.array(v.string())),
  /** Ignored: the server words the history line itself (`saveMsg`). Still accepted so older callers keep working. */
  sentence: v.optional(v.string()),
}

export const save = mutation({ args: saveArgs, handler: async (ctx, args) => saveAs(ctx, await actorFor(ctx, args.site), args) })

/** `save` for an actor already known: the platform's signed-in person, or the agent door's key (SPEC 16). */
export async function saveAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof saveArgs>) {
  checkRev(args.baseRev)
  return idempotent(ctx, actor, args, () => saveNow(ctx, actor, args))
}

/**
 * The languages a save changed when it changed only translations: the upper-case codes (as the diff tags them), or
 * undefined when it changed the main language or a field that has no languages.
 */
function onlyTranslations(schema: Schema, brick: Schema['bricks'][string], roots: string[], before: Data, after: Data): string | undefined {
  const main = schema.locales[0]!
  const changed = new Set<string>()
  for (const root of roots) {
    if (!isTranslatable(brick.fields[root]!)) return undefined
    for (const { locale } of localeDiffs(before[root] ?? null, after[root] ?? null)) changed.add(locale)
  }
  if (!changed.size || changed.has(main)) return undefined
  return schema.locales.filter((l) => changed.has(l)).map((l) => l.toUpperCase()).join(', ')
}

/**
 * The history line of a save, built from what changed: "{brick}: {fields} changed" for a single,
 * "{fields} changed in “{title}”" for an entry, with the languages in brackets when only translations changed.
 * The field names are one label per locale, joined, so every reader gets their own language. The title is the
 * entry's before the save, like the Studio showed it.
 */
function saveMsg(schema: Schema, brick: Schema['bricks'][string], entry: Doc<'entries'>, roots: string[], after: Data, onlyConfirm: boolean): HistoryMsg {
  if (onlyConfirm) return msg('history.translationConfirmed')
  const main = schema.locales[0]!
  const fields: Label = Object.fromEntries(schema.locales.map((l) => [l, roots.map((k) => labelIn(brick.fields[k]!.label, l, main)).join(', ')]))
  const languages = onlyTranslations(schema, brick, roots, entry.data as Data, after)
  if (brick.kind === 'single') return languages ? msg('history.changedSingleIn', { label: brick.label, fields, languages }) : msg('history.changedSingle', { label: brick.label, fields })
  const title = labelOf(schema, entry.brick, entry.data as Data)
  return languages ? msg('history.changedEntryIn', { fields, title, languages }) : msg('history.changedEntry', { fields, title })
}

/**
 * The weekly task (`weeklyTask`, "this week's lunch") always covers the current week: a week start it writes must be
 * today's work week in the site's time zone. Checked on every save, so a proposal made last week and approved after
 * the week changed goes stale instead of moving the website's week.
 */
function refuseOtherWeek(schema: Schema, task: string | undefined, taskBrick: string, fields: Record<string, unknown>) {
  const brick = Object.hasOwn(schema.bricks, taskBrick) ? schema.bricks[taskBrick] : undefined
  const weekly = brick ? weeklyTask(brick) : undefined
  if (!weekly || task !== `${taskBrick}.${weekly.task.id}` || !Object.hasOwn(fields, weekly.field)) return
  if (fields[weekly.field] !== resolveToken('@workWeek', schema.timeZone, schema.week)) fail('INVALID', 'errors.weeklyTaskThisWeek', undefined, { field: weekly.field })
}

/**
 * A collection that plans a single ahead (`plans`) holds one entry per week: a second plan for the same week would
 * never show (the site takes the first). Checked on every write that can put a plan on a week: create, save, restore
 * and undo. `self` is the entry being written, `changed` its changed fields (a write that keeps the week is not
 * checked); the trash does not count. A create or save is refused at the week field, so the Studio's form shows it
 * there; a restore or undo has no form, so its message says it (`whole`).
 */
async function refuseSecondPlan(ctx: QueryCtx, actor: Actor, brickKey: string, brick: Brick, data: Data, o: { self?: Id<'entries'>; changed?: readonly string[]; whole?: boolean } = {}) {
  const field = brick.kind === 'collection' ? brick.plans?.field : undefined
  if (!field || data[field] === undefined || (o.changed && !o.changed.includes(field))) return
  const rows = await rowsOf(ctx, actor.site._id, brickKey)
  if (!rows.some((r) => r._id !== o.self && !r.deletedAt && same((r.data as Data)[field], data[field]))) return
  const issue = { path: field, code: 'weekAlreadyPlanned', key: 'errors.weekAlreadyPlanned', message: t(DEFAULT_LOCALE, 'errors.weekAlreadyPlanned') }
  fail('INVALID', o.whole ? 'errors.weekAlreadyPlanned' : 'errors.pleaseCheckMarkedFields', undefined, { errors: [issue] })
}

/**
 * The answer of a save or revert that had nothing to write: the entry as it is, and no history row. A named type, so
 * the answers that wrote one keep `change` as a required field instead of an optional one (which JSON cannot hold).
 */
type Unchanged = { entry: Id<'entries'>; rev: number; contentRev: number; warnings: Json[] }

/** The save itself, steps 3 to 7 of SPEC 4.1 without the repeated-op step: `revert` wraps it in its own and words the line (`line`). */
async function saveNow(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof saveArgs>, line?: HistoryMsg) {
  const entry = await entryOf(ctx, actor, args.entry)
  const schema = actor.site.schema as Schema
  const brick = brickOf(schema, entry)
  const main = schema.locales[0]!
  const locale = args.locale as Locale | undefined
  if (locale !== undefined && !schema.locales.includes(locale)) fail('INVALID', 'errors.languageNotSetUp', { locale })
  const confirm = args.confirm ?? []
  if (confirm.length && (!locale || locale === main)) fail('INVALID', 'errors.confirmOnlyForForeignLanguage')

  for (const key of Object.keys(args.fields)) {
    if (liveField(brick, key).type === 'slug') fail('INVALID', 'errors.addressFixed', undefined, { field: key })
  }
  for (const leaf of confirm) liveField(brick, rootOf(leaf))
  // Confirmed leaves count like a change of their root field: rights and conflicts (SPEC 3).
  const roots = [...new Set([...Object.keys(args.fields), ...confirm.map(rootOf)])]
  // A planned week is edited with the weekly task of the single it stands in for (`taskBrickOf`).
  const taskBrick = taskBrickOf(schema, args.task, entry)
  authorize(actor, schema, { task: args.task, brick: taskBrick, kind: 'edit', fields: roots, entry })
  refuseOtherWeek(schema, args.task, taskBrick, args.fields)

  if (entry.deletedAt) fail('CHANGED_SINCE', 'errors.thisEntryDeletedSince', undefined, current(entry))
  // A base above the entry's revision was never read, so it cannot vouch for anything.
  if (args.baseRev > entry.rev) fail('CHANGED_SINCE', 'errors.someoneChangedMeanwhile', undefined, current(entry))
  const conflicts = roots.filter((r) => (entry.fieldRevs[r] ?? 0) > args.baseRev)
  if (conflicts.length) fail('CHANGED_SINCE', 'errors.someoneChangedMeanwhile', undefined, { ...(current(entry) as object), conflicts, by: await conflictAuthors(ctx, actor, entry, conflicts, args.baseRev) })

  const before = entry.data as Data
  const data: Data = { ...before }
  for (const [key, value] of Object.entries(args.fields)) {
    const field = brick.fields[key]!
    // Cleared in a foreign language: only that language's value goes, the main language stays.
    const merged = value === null
      ? (locale && locale !== main && isTranslatable(field) ? withoutLocale(before[key], locale) : undefined)
      : mergeField(field, before[key], value as Json, locale)
    if (merged === undefined) delete data[key]
    else data[key] = merged
  }
  const moved = locale !== undefined && locale !== main ? await foreignSlugs(ctx, actor, entry, brick, locale, before, data) : []
  for (const leaf of confirm) {
    if (!leavesOf(brick.fields[rootOf(leaf)]!, data[rootOf(leaf)], rootOf(leaf)).has(leaf)) fail('INVALID', 'errors.leafNotTranslatable', { leaf }, { leaf })
  }
  const prints = nextPrints({ fields: brick.fields, roots, before, after: data, prints: entry.prints, main, confirm: confirm.length ? { locale: locale!, leaves: confirm } : undefined })

  // A root counts as changed when its value or one of its prints changed.
  const printsOf = (p: Prints, root: string) => Object.fromEntries(Object.entries(p).filter(([leaf]) => underRoot(leaf, root)))
  const changed = roots.filter((r) => !same(data[r], before[r]) || !same(printsOf(prints, r), printsOf(entry.prints, r)))
  if (!changed.length) {
    const unchanged: Unchanged = { entry: entry._id, rev: entry.rev, contentRev: actor.site.contentRev, warnings: [] }
    return unchanged
  }

  const { errors, warnings } = await validate(schema, entry.brick, data, { mode: 'patch', changed: new Set(Object.keys(args.fields)), ...(await lookupsFor(ctx, actor.site._id, brick.fields, data)) })
  if (errors.length) fail('INVALID', 'errors.pleaseCheckMarkedFields', undefined, { errors: errors as unknown as Json })
  await refuseSecondPlan(ctx, actor, entry.brick, brick, data, { self: entry._id, changed })
  await checkNewFiles(ctx, actor.site._id, brick.fields, before, data)
  // A draft is not online yet: its links are checked when it goes live.
  if (stateOf(entry) === 'live') await checkNewLinks(ctx, actor.site, [{ entry, fields: brick.fields, before, after: data }])

  const onlyConfirm = Object.keys(args.fields).length === 0
  const history = recorded(line ?? saveMsg(schema, brick, entry, changed, data, onlyConfirm), schema)

  // Everything is checked: a change that needs a yes becomes a proposal and writes nothing (SPEC 17).
  if (await needsProposal(ctx, actor, 'save', args.task, taskBrick, entry)) {
    const pick = (d: Data) => Object.fromEntries(changed.filter((r) => d[r] !== undefined).map((r) => [r, d[r]!]))
    return await propose(ctx, actor, {
      op: 'save', brick: entry.brick, entry: entry._id, args: args as unknown as Json,
      base: { rev: entry.rev, fieldRevs: Object.fromEntries(changed.map((r) => [r, entry.fieldRevs[r] ?? 0])) },
      before: pick(before) as Json, after: pick(data) as Json, ...history,
    })
  }

  const written = await commitEntry(ctx, {
    actor, entry, fields: brick.fields, roots: changed, data, prints,
    kind: onlyConfirm ? 'confirm' : 'save', history, opId: args.opId,
  })
  if (moved.length) {
    const rows = (await ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', entry._id)).collect()).filter((r) => r.locale === locale)
    for (const { slug } of moved) {
      // The slugs rows hold no field key: this pairs them by language only, which is exact while a brick has one slug field.
      const row = rows.shift()
      if (row) await ctx.db.patch(row._id, { slug })
      else await ctx.db.insert('slugs', { site: actor.site._id, brick: entry.brick, locale: locale!, slug, entry: entry._id })
    }
  }
  // What the other languages show now (the Studio's message after saving); a draft is not on the website.
  const translation = stateOf(entry) === 'draft' ? [] : translationNotes(schema, entry.brick, { _id: entry._id, data, prints }, before, changed, locale)
  // A week planned ahead or a planned price shows later than "in about a minute": the Studio says from when.
  const from = stateOf(entry) === 'live' ? liveFrom(schema, entry.brick, data, changed, todayIn(schema.timeZone)) : undefined
  return { entry: entry._id, rev: written.rev, contentRev: written.contentRev, change: written.change, warnings: warnings as unknown as Json, translation, ...(from ? { liveFrom: from } : {}) }
}

const undoArgs = { site: v.string(), opId: v.string(), task: v.optional(v.string()), change: v.string() }

export const undo = mutation({ args: undoArgs, handler: async (ctx, args) => undoAs(ctx, await actorFor(ctx, args.site), args) })

/** `undo` for an actor already known: the platform's signed-in person, or the agent door's key (SPEC 16). */
export async function undoAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof undoArgs>): Promise<Json> {
  return idempotent(ctx, actor, args, async () => {
    const changeId = ctx.db.normalizeId('changes', args.change)
    const change = changeId ? await ctx.db.get(changeId) : null
    if (!change || change.site !== actor.site._id) fail('NOT_FOUND', 'errors.changeNotFound')
    // Structural changes (remove, restore, reorder) and releases are not undoable (SPEC 4.2).
    if (change.kind !== 'save' || !change.entry) fail('NOT_UNDOABLE', 'errors.changeNotUndoable')
    const entry = await entryOf(ctx, actor, change.entry)
    const schema = actor.site.schema as Schema
    const brick = brickOf(schema, entry)
    const roots = change.fields ?? []
    const taskBrick = taskBrickOf(schema, args.task, entry)
    authorize(actor, schema, { task: args.task, brick: taskBrick, kind: 'edit', fields: roots, entry })
    refuseDirectWrite(actor, taskBrick, args.task)
    await refuseAgentUndo(ctx, actor, entry)

    const migrated = await ctx.db.query('migrationsApplied').withIndex('by_site_id', (q) => q.eq('site', actor.site._id)).collect()
    const block = undoBlockOf(change, entry, migrated)
    if (block === 'undone') fail('NOT_UNDOABLE', 'errors.changeNotUndoable')
    if (block === 'removed') fail('NOT_UNDOABLE', 'errors.entryDeletedSince')
    if (block === 'changed') fail('CHANGED_SINCE', 'errors.someoneChangedMeanwhileNoUndo', undefined, current(entry))
    if (block === 'schema') fail('NOT_UNDOABLE', 'errors.schemaChangedSinceChange')

    // Values and prints come back exactly; an undo never confirms a translation.
    const before = (change.before ?? {}) as Data
    const data: Data = { ...(entry.data as Data) }
    for (const root of roots) {
      liveField(brick, root)
      if (before[root] === undefined) delete data[root]
      else data[root] = before[root]!
    }
    const prints: Prints = Object.fromEntries(Object.entries(entry.prints).filter(([leaf]) => !roots.some((r) => underRoot(leaf, r))))
    Object.assign(prints, (change.printsBefore ?? {}) as Prints)

    const restoredFiles = await untrashFilesOf(ctx, actor.site._id, brick.fields, entry.data as Data, data)
    const { errors } = await validate(schema, entry.brick, data, { mode: 'patch', changed: new Set(roots), ...(await lookupsFor(ctx, actor.site._id, brick.fields, data)) })
    if (errors.length) fail('NOT_UNDOABLE', 'errors.oldVersionNoLongerFitsSchema', undefined, { errors: errors as unknown as Json })
    // Moving a plan back to a week that was planned again since would hide one of the two.
    await refuseSecondPlan(ctx, actor, entry.brick, brick, data, { self: entry._id, changed: roots, whole: true })
    await checkNewFiles(ctx, actor.site._id, brick.fields, entry.data as Data, data)
    if (stateOf(entry) === 'live') await checkNewLinks(ctx, actor.site, [{ entry, fields: brick.fields, before: entry.data as Data, after: data }])

    const written = await commitEntry(ctx, {
      actor, entry, fields: brick.fields, roots, data, prints, kind: 'undo', history: recorded(msg('history.undo', { what: change.msg ? (change.msg as HistoryMsg) : change.sentence }), schema), opId: args.opId,
    })
    await ctx.db.patch(change._id, { undoneBy: written.change })
    const result: Json = { entry: entry._id, rev: written.rev, contentRev: written.contentRev, warnings: [], ...(restoredFiles.length ? { restoredFiles: restoredFiles.map((f) => f.name) } : {}) }
    return result
  })
}

// ---- Verlauf (SPEC 4.2): an earlier version of an entry, and going back to it. ----

/**
 * The entry's field values right after `changeId`. Per field, the earliest later change of this entry
 * that touched it gives the value through its `before`; a field no later change touched keeps its
 * current value. `touched` lists the fields that a later change touched (the only ones that can differ).
 */
async function versionOf(ctx: QueryCtx, actor: Actor, entryId: string, changeId: string) {
  const entry = await entryOf(ctx, actor, entryId)
  const id = ctx.db.normalizeId('changes', changeId)
  const change = id ? await ctx.db.get(id) : null
  // A change older than the retention window is gone (SPEC 12): then there is no such version.
  if (!change || change.site !== actor.site._id || change.entry !== entry._id) fail('NOT_FOUND', 'errors.versionNotFound')
  // The index lists the entry's changes oldest first; "later" is what follows the requested one.
  const all = await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry._id)).collect()
  const later = all.slice(all.findIndex((c) => c._id === change._id) + 1)
  const data: Data = { ...(entry.data as Data) }
  const touched = new Set<string>()
  for (const c of later) {
    const before = (c.before ?? {}) as Data
    for (const root of c.fields ?? []) {
      if (touched.has(root)) continue
      touched.add(root)
      if (before[root] === undefined) delete data[root]
      else data[root] = before[root]
    }
  }
  return { entry, change, data, touched: [...touched] }
}

/**
 * What going back to `data` writes: the touched fields whose value differs from now (`null` removes one), without
 * the address (it is fixed) and fields the schema no longer has. `revert` saves exactly these; `versionAt` shows them.
 */
function revertFields(brick: Brick | undefined, touched: string[], data: Data, now: Data): Record<string, Json> {
  const fields: Record<string, Json> = {}
  for (const root of touched) {
    const field = brick && Object.hasOwn(brick.fields, root) ? brick.fields[root] : undefined
    if (!field || field.retired || field.type === 'slug') continue
    if (!same(data[root], now[root])) fields[root] = data[root] ?? null
  }
  return fields
}

/**
 * The entry right after a change (`data`; `fields` names the ones a later change touched), plus `diff`: what going
 * back to it changes, field by field, with now as `before` and that version as `after`. Empty: it is the current
 * version. One answer for the Studio (`versionAt`, shown before the person confirms) and the agent door
 * (`ginko_version_at`), for an actor already known (SPEC 16).
 */
export async function versionAtAs(ctx: QueryCtx, actor: Actor, args: { entry: string; change: string }) {
  const { entry, change, data, touched } = await versionOf(ctx, actor, args.entry, args.change)
  const schema = actor.site.schema as Schema
  const brick = Object.hasOwn(schema.bricks, entry.brick) ? schema.bricks[entry.brick] : undefined
  const now = entry.data as Data
  const fields = revertFields(brick, touched, data, now)
  const pick = (from: Data) => Object.fromEntries(Object.keys(fields).filter((root) => from[root] !== undefined).map((root) => [root, from[root]!]))
  return { entry: entry._id, change: change._id, at: change.at, data, fields: touched, diff: diffFields(brick?.fields, pick(now), pick(data), schema.locales[0]!) }
}

export const versionAt = query({
  args: { site: v.string(), entry: v.string(), change: v.string() },
  handler: async (ctx, args) => versionAtAs(ctx, await actorFor(ctx, args.site), args),
})

const revertArgs = { site: v.string(), opId: v.string(), task: v.optional(v.string()), entry: v.string(), change: v.string() }

export const revert = mutation({ args: revertArgs, handler: async (ctx, args) => revertAs(ctx, await actorFor(ctx, args.site), args) })

/**
 * Goes back to the version after `change` as a new, normal save: rights, validation, prints, file
 * references, proposals and undo all apply. Only fields that differ from now are written.
 */
export async function revertAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof revertArgs>) {
  return idempotent(ctx, actor, args, async () => {
    const { entry, change, data, touched } = await versionOf(ctx, actor, args.entry, args.change)
    if (entry.deletedAt) fail('INVALID', 'errors.entryDeletedRestoreFirst')
    const schema = actor.site.schema as Schema
    const brick = brickOf(schema, entry)
    const now = entry.data as Data
    const fields = revertFields(brick, touched, data, now)
    // Through the weekly task the version's values come back for this week: the task always covers it (`refuseOtherWeek`).
    const taskBrick = taskBrickOf(schema, args.task, entry)
    const weekly = Object.hasOwn(schema.bricks, taskBrick) ? weeklyTask(schema.bricks[taskBrick]!) : undefined
    if (weekly && args.task === `${taskBrick}.${weekly.task.id}`) delete fields[weekly.field]
    if (!Object.keys(fields).length) {
      const unchanged: Unchanged = { entry: entry._id, rev: entry.rev, contentRev: actor.site.contentRev, warnings: [] }
      return unchanged
    }
    // Out of the trash before the save, so its file checks pass.
    const restoredFiles = await untrashFilesOf(ctx, actor.site._id, brick.fields, now, { ...now, ...fields })
    const saved = await saveNow(ctx, actor, {
      site: args.site, opId: args.opId, ...(args.task === undefined ? {} : { task: args.task }),
      entry: entry._id, baseRev: entry.rev, fields,
    }, msg('history.revert', { when: change.at }))
    // A revert that needs a yes writes nothing, so the files go back to the trash: taking a file out of it is the
    // owner's step (files.restore). The approval then refuses until someone restored the file.
    if ('proposal' in saved) {
      for (const file of restoredFiles) await ctx.db.patch(file.id, { trashedAt: file.trashedAt })
      return saved
    }
    return restoredFiles.length ? { ...saved, restoredFiles: restoredFiles.map((f) => f.name) } : saved
  })
}

// ---- Structural operations (SPEC 4.2): create, remove, restore, move. ----
// They follow the flow of SPEC 4.1 like `save`. The site's counters (`Counters` in lib/lifecycle.ts)
// are changed in memory and written back once at the end.

const plainObject = (value: Json | undefined): Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}

const textOf = (value: Json | undefined): string => (typeof value === 'string' ? value : '')

/**
 * Label of an entry for history lines, proposals, search hits and file uses: its title as the Studio shows it (core
 * `entryTitle`, so a planned week is "Woche ab 19.10.2026"), else the brick's label, in the main language.
 */
export function labelOf(schema: Schema, brickKey: string, data: Data): string {
  const brick = Object.hasOwn(schema.bricks, brickKey) ? schema.bricks[brickKey] : undefined
  if (!brick) return brickKey
  const main = schema.locales[0]!
  return titleOf(schema, brick, data, undefined) ?? labelIn(brick.label, main, main)
}

function structuralBrick(schema: Schema, key: string): CollectionBrick {
  const brick = Object.hasOwn(schema.bricks, key) ? schema.bricks[key] : undefined
  if (!brick || brick.retired) fail('INVALID', 'errors.brickNoLongerEditable')
  if (brick.kind !== 'collection') fail('INVALID', 'errors.brickNotCollection', undefined, { brick: key })
  return brick
}

/** Every row of a brick in order, deleted ones included: their order values stay in use. */
function rowsOf(ctx: QueryCtx, site: Id<'sites'>, brick: string) {
  return ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site).eq('brick', brick)).collect()
}

const stateOf = (entry: Doc<'entries'>) => entry.state ?? 'live'

/** What the UI needs to show an entry's place in its life: deleted, draft, scheduled or live (SPEC 15). */
const lifeStateOf = (entry: Doc<'entries'>): Json => ({
  entry: entry._id, lifeRev: entry.lifeRev, deleted: !!entry.deletedAt, state: stateOf(entry),
  ...(entry.publishAt === undefined ? {} : { publishAt: entry.publishAt }),
})

/**
 * The first free slug from `base` in one brick and locale: not used by another entry of the brick (removed ones keep
 * theirs until they are deleted for good), and no URL of a static page or of another brick's entry. `own` is the entry
 * the slug is for: its own slug in that locale is free for it.
 */
async function freeSlug(ctx: MutationCtx, actor: Actor, brick: string, locale: Locale, base: string, own?: Id<'entries'>) {
  const schema = actor.site.schema as Schema
  const rowsOf = (key: string) => ctx.db.query('slugs').withIndex('by_key', (q) => q.eq('site', actor.site._id).eq('brick', key).eq('locale', locale)).collect()
  const taken = new Set((await rowsOf(brick)).filter((r) => r.entry !== own).map((r) => r.slug))
  // Other bricks and static pages may own the URL this slug would make.
  const others: Record<string, string[]> = {}
  for (const [key, other] of Object.entries(schema.bricks)) if (key !== brick && other.kind === 'collection' && other.route) others[key] = (await rowsOf(key)).map((r) => r.slug)
  for (const slug of blockedSlugs(schema, brick, locale, others)) taken.add(slug)
  return uniqueSlug(base, (s) => taken.has(s))
}

/**
 * Slugs of a new entry (SPEC 2.2): per locale from its `from` field, unique in the brick and
 * locale. A missing foreign value takes the main-language slug of the same entry until the
 * translated title is saved (`foreignSlugs`).
 */
async function slugsFor(ctx: MutationCtx, actor: Actor, brick: string, fields: Fields, data: Data) {
  const schema = actor.site.schema as Schema
  const main = schema.locales[0]!
  const out: Data = { ...data }
  const rows: { locale: string; slug: string }[] = []
  for (const [name, field] of Object.entries(fields)) {
    if (field.type !== 'slug') continue
    const from = plainObject(data[field.from])
    const bases = slugBases(schema.locales, Object.fromEntries(schema.locales.map((locale) => [locale, textOf(from[locale])])))
    const made: Record<string, string> = {}
    for (const locale of schema.locales) {
      made[locale] = await freeSlug(ctx, actor, brick, locale, bases[locale] ?? made[main]!)
    }
    out[name] = made
    for (const [locale, slug] of Object.entries(made)) rows.push({ locale, slug })
  }
  return { data: out, slugs: rows }
}

/**
 * A foreign address comes from the translated title (SPEC 2.2, decisions.md): an entry made in the main language has
 * the main slug in every other language. While the entry has no page in `locale`, a new title there makes its slug
 * there anew; once the page is online, its address stays. The main slug never changes. Writes into `data` and returns
 * the new slugs, whose rows the caller moves once the save is written.
 */
async function foreignSlugs(ctx: MutationCtx, actor: Actor, entry: Doc<'entries'>, brick: Schema['bricks'][string], locale: Locale, before: Data, data: Data) {
  const schema = actor.site.schema as Schema
  const made: { key: string; slug: string }[] = []
  if (brick.kind !== 'collection' || !brick.route?.[locale]) return made
  if (urlsFor(schema, entry.brick, brick, { id: entry._id, data: before, prints: entry.prints as Prints })[locale]) return made
  for (const [key, field] of Object.entries(brick.fields)) {
    if (field.type !== 'slug' || field.retired) continue
    const from = Object.hasOwn(brick.fields, field.from) ? brick.fields[field.from]! : undefined
    if (!from || from.retired || !isTranslatable(from)) continue
    const title = textOf(plainObject(data[field.from])[locale])
    if (!title || title === textOf(plainObject(before[field.from])[locale])) continue
    const slug = await freeSlug(ctx, actor, entry.brick, locale, slugify(title), entry._id)
    if (slug === plainObject(data[key])[locale]) continue
    data[key] = { ...plainObject(data[key]), [locale]: slug }
    made.push({ key, slug })
  }
  return made
}

/**
 * Room for one more live entry in a collection (SPEC 4.2 create). Returns the expired entries
 * to remove first, oldest order first; fails when the collection is full and nothing expired.
 */
function roomPlan(actor: Actor, brick: CollectionBrick, rows: Doc<'entries'>[]): Doc<'entries'>[] {
  const live = rows.filter((r) => !r.deletedAt)
  if (live.length < brick.max) return []
  const need = live.length - brick.max + 1
  const today = todayIn((actor.site.schema as Schema).timeZone)
  // A draft is never expired: it is not published yet (SPEC 15). It still takes a place in `max`.
  const expired = deletesExpired(brick) ? live.filter((r) => r.state !== 'draft' && !isVisible(brick as Brick, r.data, today)) : []
  if (expired.length < need) fail('INVALID', 'errors.collectionFull', { max: brick.max }, { max: brick.max })
  return expired.slice(0, need)
}

const createArgs = {
  site: v.string(),
  opId: v.string(),
  task: v.optional(v.string()),
  brick: v.string(),
  /** Stored-format values of the whole entry; list rows carry their `_id`s. Slugs are set by the server. */
  data: v.record(v.string(), v.any()),
  /**
   * Only for a collection with `drafts` (SPEC 15). Absent: a draft. `{}`: live at once.
   * `{ at }`: a draft that goes online at `at` (ms). Ignored for a collection without `drafts`.
   */
  publish: v.optional(v.object({ at: v.optional(v.number()) })),
}

export const create = mutation({ args: createArgs, handler: async (ctx, args) => createAs(ctx, await actorFor(ctx, args.site), args) })

/** `create` for an actor already known: the platform's signed-in person, or the agent door's key (SPEC 16). */
export async function createAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof createArgs>) {
  return idempotent(ctx, actor, args, async () => {
    const schema = actor.site.schema as Schema
    const brick = structuralBrick(schema, args.brick)
    authorize(actor, schema, { task: args.task, brick: args.brick, kind: 'create' })

    // Retired fields are not writable (SPEC 4.1 step 3); validation skips them, so reject them here.
    for (const key of Object.keys(args.data)) liveField(brick, key)
    const slugged = await slugsFor(ctx, actor, args.brick, brick.fields, args.data as Data)
    const data = slugged.data
    // Translations sent with a new entry are fresh: every foreign leaf gets the print of its main value.
    const prints = nextPrints({ fields: brick.fields, roots: Object.keys(brick.fields), before: {}, after: data, prints: {}, main: schema.locales[0]!, confirm: undefined })
    const { errors } = await validate(schema, args.brick, data, { mode: 'create', ...(await lookupsFor(ctx, actor.site._id, brick.fields, data)) })
    if (errors.length) fail('INVALID', 'errors.pleaseCheckMarkedFields', undefined, { errors: errors as unknown as Json })
    await refuseSecondPlan(ctx, actor, args.brick, brick, data)

    const rows = await rowsOf(ctx, actor.site._id, args.brick)
    const removing = roomPlan(actor, brick, rows)
    const c = countersOf(actor.site)
    if (c.entryCount - removing.length >= BUDGET.entries) fail('TOO_LARGE', 'errors.siteEntryLimitReached')
    const size = entryBytes(data, prints)
    if (size > BUDGET.entryBytes) fail('TOO_LARGE', 'errors.entryTooLarge', overBudget(size, BUDGET.entryBytes))
    if (c.bytes + size > BUDGET.siteBytes) fail('TOO_LARGE', 'errors.siteStorageLimitReached', overBudget(c.bytes + size, BUDGET.siteBytes))
    const trees = await treesOf(brick.fields, data)
    if (c.treeBytes + trees.bytes > BUDGET.treeBytes) fail('TOO_LARGE', 'errors.entryTooComplex')
    const files = fileIdsOf(brick.fields, data, { isUploadId: uploadIdsOf(ctx) })
    await checkFiles(ctx, actor.site._id, files, fileIdsOf(brick.fields, data, { only: 'image' }))
    // Without `drafts` an entry is always live. With it, only `publish: {}` goes live at once.
    const lateAt = lapsed(actor, args.publish?.at)
    const draft = brick.drafts === true && (args.publish === undefined || (args.publish.at !== undefined && !lateAt))
    const at = draft ? args.publish?.at : undefined
    // Checked before anything is written, so a late failure (apply of a proposal) leaves no half-done removal behind.
    if (at !== undefined) checkFuture(at)

    // A plain draft is not live; a live or scheduled entry is (SPEC 17).
    if (await needsProposal(ctx, actor, 'create', args.task, args.brick, { state: draft && at === undefined ? 'draft' : 'live' })) {
      // A proposal that would go live with a broken link is refused now, not only when approved. The entry does not exist yet: it joins the link check under a temporary id.
      if (!draft || at !== undefined) await checkNewLinks(ctx, actor.site, [{ entry: { _id: 'proposed' as Id<'entries'>, brick: args.brick }, fields: brick.fields, before: {}, after: data, isNew: true }])
      return await propose(ctx, actor, {
        op: 'create', brick: args.brick, args: args as unknown as Json, base: {}, after: data as Json,
        ...recorded(msg('history.createProposal', { title: labelOf(schema, args.brick, data) }), schema),
      })
    }

    for (const expired of removing) {
      await softRemove(ctx, c, expired, args.opId, SYSTEM, recorded(msg('history.expiredRemoved', { title: labelOf(schema, args.brick, expired.data) }), schema))
    }
    const order = Math.max(0, ...rows.map((r) => r.order)) + 1
    const entry = await ctx.db.insert('entries', {
      site: actor.site._id, brick: args.brick, kind: 'item', order, data, rev: 1,
      fieldRevs: Object.fromEntries(Object.keys(brick.fields).map((name) => [name, 1])), lifeRev: 1, prints, bytes: size, treeBytes: trees.bytes,
      // A draft's `contentAt` is set again when it goes live.
      contentAt: Date.now(),
      ...(draft ? { state: 'draft' as const } : {}),
      // Staff always create through a create task, and may change what they created with it later (`authorize`).
      ...(actor.role === 'staff' ? { createdBy: actor.user.id } : {}),
    })
    await putTrees(ctx, actor.site._id, entry, trees.json)
    if (at !== undefined) await ctx.db.patch(entry, { publishAt: at, publishJob: await ctx.scheduler.runAt(at, internal.entries.publishDue, { entry, at }) })
    for (const row of slugged.slugs) {
      await ctx.db.insert('slugs', { site: actor.site._id, brick: args.brick, locale: row.locale, slug: row.slug, entry })
    }
    // A live or scheduled entry puts its links online; checked after the insert so its own URL is known (a failure undoes the whole create).
    if (!draft || at !== undefined) await checkNewLinks(ctx, actor.site, [{ entry: (await ctx.db.get(entry))!, fields: brick.fields, before: {}, after: data }])
    c.entryCount += 1
    c.bytes += size
    c.treeBytes += trees.bytes
    if (!draft) c.contentRev += 1
    const label = labelOf(schema, args.brick, data)
    const change = await ctx.db.insert('changes', {
      site: actor.site._id, entry, brick: args.brick, ...byOf(actor), opId: args.opId, kind: 'create',
      ...recorded(!draft ? (lateAt ? msg('history.publishedLate', { title: label }) : msg('history.created', { title: label })) : at === undefined ? msg('history.draftCreated', { title: label }) : msg('history.draftCreatedScheduled', { title: label, at }), schema),
      after: data, entryRev: 1, contentRev: c.contentRev, at: Date.now(),
    })
    await syncEntryRefs(ctx, actor.site._id, entry, await entryUses(ctx, brick.fields, data, schema.locales))
    if (files.size) await syncFileRefs(ctx, actor.site._id, 'change', change, files)
    await writeCounters(ctx, actor.site._id, c)

    // What the other languages show of the new entry (the Studio's message after saving); a draft is not on the website.
    const translation = draft ? [] : translationNotes(schema, args.brick, { _id: entry, data, prints }, {}, Object.keys(brick.fields))
    // A new planned week shows from its first day; the Studio says from when.
    const from = draft ? undefined : liveFrom(schema, args.brick, data, Object.keys(data), todayIn(schema.timeZone))
    return { entry, rev: 1, contentRev: c.contentRev, state: draft ? 'draft' : 'live', ...(at === undefined ? {} : { publishAt: at }), translation, ...(from ? { liveFrom: from } : {}) }
  })
}

// ---- Duplicate (SPEC 4.2): a new entry made with the normal create path. ----

const duplicateArgs = { site: v.string(), opId: v.string(), task: v.optional(v.string()), entry: v.string() }

/** The same row `_id` for the same operation, so a retry with the same `opId` sends the same data and is replayed. */
const rowIdFor = (opId: string, path: string) => sha256(`${opId}:${path}`).slice(0, 10)

/** List rows of the copy get their own `_id`s, so the two entries share no row identity (history, translation prints). */
function withNewRowIds(field: Field, value: Json, path: string, opId: string): Json {
  if (field.type !== 'list' || !Array.isArray(value)) return value
  return value.map((row, i) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return row
    const out: Record<string, Json> = { ...row, _id: rowIdFor(opId, `${path}.${i}`) }
    for (const [key, inner] of Object.entries(field.of)) if (out[key] !== undefined) out[key] = withNewRowIds(inner, out[key]!, `${path}.${i}.${key}`, opId)
    return out
  })
}

/** The copy's label in that text's language ("Weinabend (Kopie)", "Wine evening (copy)"); English for a language the catalog lacks. */
const copyText = (text: string, locale: string) => t(isLocale(locale) ? locale : 'en', 'content.copyOf', { text })

/** The copy mark after every text of the value, or the value as it is when one of them would then be too long. `main` is the language of a plain text. */
function withCopySuffix(field: Field, value: Json, main: string): Json {
  const texts: [string, Json][] = typeof value === 'string' ? [[main, value]] : Object.entries(plainObject(value))
  const max = effectiveMax(field)
  const marked = texts.map(([locale, text]) => [locale, typeof text === 'string' && text !== '' ? copyText(text, locale) : text] as const)
  if (marked.some(([, text]) => typeof text === 'string' && [...text].length > max)) return value
  return typeof value === 'string' ? marked[0]![1] : Object.fromEntries(marked)
}

/**
 * The data of the copy: live fields only; slugs left out (create makes new, free ones from the title,
 * so "Wildwoche (Kopie)" becomes `wildwoche-kopie`, then `wildwoche-kopie-2`).
 */
function copyOf(brick: CollectionBrick, data: Data, opId: string, main: string): Data {
  const slugSources = new Set(Object.values(brick.fields).flatMap((field) => (field.type === 'slug' && !field.retired ? [field.from] : [])))
  const label = ordered(brick.fields).find(([, field]) => field.type === 'text' && !field.retired)?.[0]
  const out: Data = {}
  for (const [name, field] of Object.entries(brick.fields)) {
    if (field.retired || field.type === 'slug' || data[name] === undefined) continue
    const value = withNewRowIds(field, data[name]!, name, opId)
    out[name] = field.type === 'text' && (name === label || slugSources.has(name)) ? withCopySuffix(field, value, main) : value
  }
  return out
}

export const duplicate = mutation({ args: duplicateArgs, handler: async (ctx, args) => duplicateAs(ctx, await actorFor(ctx, args.site), args) })

/**
 * Creates a copy of an entry. Rights, limits, checks, file references and the approval policy are
 * those of `create`; in a collection with `drafts` the copy is a draft. Staff names the create task.
 */
export async function duplicateAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof duplicateArgs>) {
  const entry = await entryOf(ctx, actor, args.entry)
  const schema = actor.site.schema as Schema
  const brick = structuralBrick(schema, entry.brick)
  authorize(actor, schema, { task: args.task, brick: entry.brick, kind: 'create' })
  if (entry.deletedAt) fail('INVALID', 'errors.removedEntryCannotCopy')
  return createAs(ctx, actor, {
    site: args.site, opId: args.opId, ...(args.task === undefined ? {} : { task: args.task }),
    brick: entry.brick, data: copyOf(brick, entry.data as Data, args.opId, schema.locales[0]!),
  })
}

const removeArgs = { site: v.string(), opId: v.string(), task: v.optional(v.string()), entry: v.string(), lifeRev: v.number() }

export const remove = mutation({ args: removeArgs, handler: async (ctx, args) => removeAs(ctx, await actorFor(ctx, args.site), args) })

/** `remove` for an actor already known: the platform's signed-in person, or the agent door's key (SPEC 16). */
export async function removeAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof removeArgs>) {
  checkRev(args.lifeRev)
  return idempotent(ctx, actor, args, async () => {
    const entry = await entryOf(ctx, actor, args.entry)
    const schema = actor.site.schema as Schema
    structuralBrick(schema, entry.brick)
    authorize(actor, schema, { task: args.task, brick: entry.brick, kind: 'remove' })
    if (entry.deletedAt || entry.lifeRev !== args.lifeRev) fail('CHANGED_SINCE', 'errors.entryChangedMeanwhile', undefined, lifeStateOf(entry))

    const label = labelOf(schema, entry.brick, entry.data as Data)
    if (await needsProposal(ctx, actor, 'remove', args.task, entry.brick, entry)) {
      return await propose(ctx, actor, {
        op: 'remove', brick: entry.brick, entry: entry._id, args: args as unknown as Json, base: { lifeRev: entry.lifeRev },
        before: entry.data as Json, ...recorded(msg('history.removeProposal', { title: label }), schema),
      })
    }

    const c = countersOf(actor.site)
    await softRemove(ctx, c, entry, args.opId, byOf(actor), recorded(msg('history.removed', { title: label }), schema))
    await writeCounters(ctx, actor.site._id, c)
    // The new lifeRev lets the UI undo this at once (restore after remove, remove after restore).
    return { entry: entry._id, contentRev: c.contentRev, lifeRev: entry.lifeRev + 1 }
  })
}

export const restore = mutation({
  args: { site: v.string(), opId: v.string(), task: v.optional(v.string()), entry: v.string(), lifeRev: v.number() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    checkRev(args.lifeRev)
    return idempotent(ctx, actor, args, async () => {
      const entry = await entryOf(ctx, actor, args.entry)
      const schema = actor.site.schema as Schema
      const brick = structuralBrick(schema, entry.brick)
      // Restoring belongs to the remove task (SPEC 2.7: restore is part of remove).
      authorize(actor, schema, { task: args.task, brick: entry.brick, kind: 'remove' })
      refuseDirectWrite(actor, entry.brick, args.task)
      if (!entry.deletedAt || entry.lifeRev !== args.lifeRev) fail('CHANGED_SINCE', 'errors.entryChangedMeanwhile', undefined, lifeStateOf(entry))

      const rows = await rowsOf(ctx, actor.site._id, entry.brick)
      const live = rows.filter((r) => !r.deletedAt).length
      if (live >= brick.max) fail('INVALID', 'errors.collectionFull', { max: brick.max }, { max: brick.max })
      // A plan whose week was planned again while it was in the trash would hide one of the two.
      await refuseSecondPlan(ctx, actor, entry.brick, brick, entry.data as Data, { whole: true })
      const c = countersOf(actor.site)
      if (c.entryCount >= BUDGET.entries) fail('TOO_LARGE', 'errors.siteEntryLimitReached')
      // The trash does not count toward the site's budget, so a restore needs room for the entry again.
      if (c.bytes + entry.bytes > BUDGET.siteBytes) fail('TOO_LARGE', 'errors.restoreNoRoom', { limit: sizeText(BUDGET.siteBytes) })
      // The trash keeps no trees: they are made again.
      const trees = await treesOf(brick.fields, entry.data as Data)
      if (c.treeBytes + trees.bytes > BUDGET.treeBytes) fail('TOO_LARGE', 'errors.entryTooComplex')

      const order = Math.max(0, ...rows.map((r) => r.order)) + 1
      const now = Date.now()
      await ctx.db.patch(entry._id, {
        deletedAt: undefined, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1, order, treeBytes: trees.bytes, ...(entry.state === 'draft' ? {} : { contentAt: now }),
      })
      await putTrees(ctx, actor.site._id, entry._id, trees.json)
      c.entryCount += 1
      c.bytes += entry.bytes
      c.trashBytes -= entry.bytes
      c.treeBytes += trees.bytes
      // A restored draft stays out of the bundle (its schedule went with the removal).
      if (entry.state !== 'draft') c.contentRev += 1
      await ctx.db.insert('changes', {
        site: actor.site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId: args.opId, kind: 'restore',
        ...recorded(msg('history.restored', { title: labelOf(schema, entry.brick, entry.data as Data) }), schema), entryRev: entry.rev + 1, contentRev: c.contentRev, at: now,
      })
      await writeCounters(ctx, actor.site._id, c)
      // The new lifeRev lets the UI undo this at once (restore after remove, remove after restore).
      return { entry: entry._id, contentRev: c.contentRev, lifeRev: entry.lifeRev + 1 }
    })
  },
})

/**
 * Deletes a removed entry for good now, as retention does after 30 days (lib/lifecycle purgeEntry): its slugs, file
 * references, trees and the row. Its change rows stay, with their old values, as long as retention keeps them. Owners
 * and admins only, because it cannot be undone; the agent door has no tool for it.
 */
export const purge = mutation({
  args: { site: v.string(), opId: v.string(), entry: v.string(), lifeRev: v.number() },
  handler: async (ctx, args): Promise<Json> => {
    const actor = await actorFor(ctx, args.site)
    if (actor.role === 'staff') fail('FORBIDDEN', 'errors.purgeOwnersOnly')
    checkRev(args.lifeRev)
    return idempotent(ctx, actor, args, async () => {
      const entry = await entryOf(ctx, actor, args.entry)
      if (!entry.deletedAt || entry.lifeRev !== args.lifeRev) fail('CHANGED_SINCE', 'errors.entryChangedMeanwhile', undefined, lifeStateOf(entry))
      const schema = actor.site.schema as Schema
      const c = countersOf(actor.site)
      await purgeEntry(ctx, c, entry)
      await ctx.db.insert('changes', {
        site: actor.site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId: args.opId, kind: 'purge',
        ...recorded(msg('history.purged', { title: labelOf(schema, entry.brick, entry.data as Data) }), schema), entryRev: entry.rev + 1, contentRev: c.contentRev, at: Date.now(),
      })
      await writeCounters(ctx, actor.site._id, c)
      const result: Json = { entry: entry._id }
      return result
    })
  },
})

// ---- Drafts (SPEC 15): publish, unpublish and the scheduled publishDue. ----

const YEAR = 365 * 24 * 60 * 60 * 1000

/** A publish time must lie in the future and at most one year ahead. */
export function checkFuture(at: number) {
  const now = Date.now()
  if (!Number.isFinite(at) || !Number.isInteger(at)) fail('INVALID', 'errors.timeInvalid')
  if (at <= now) fail('INVALID', 'errors.timeMustBeFuture')
  if (at > now + YEAR) fail('INVALID', 'errors.timeTooFarAhead')
}

/**
 * A proposal that asked for a publish time is approved after that time: the approval publishes at once, it does not
 * refuse (the author cannot send it again, and the approver did not choose the time). Only an approved proposal being
 * applied (`approvedBy`) gets this; a person's own call with a past time is still refused by `checkFuture`.
 */
function lapsed(actor: Actor, at: number | undefined): boolean {
  return actor.approvedBy !== undefined && at !== undefined && at <= Date.now()
}

async function cancelJob(ctx: MutationCtx, entry: Doc<'entries'>) {
  if (entry.publishJob) await ctx.scheduler.cancel(entry.publishJob)
}

/** Draft → live: state, no schedule, `contentAt`, lifeRev+1, contentRev+1 and one 'publish' change. Shared by `publishAs` and `publishDue`. */
async function goLive(ctx: MutationCtx, c: Counters, entry: Doc<'entries'>, by: By, opId: string, history: Recorded, now = Date.now()) {
  await cancelJob(ctx, entry)
  await ctx.db.patch(entry._id, { state: 'live', publishAt: undefined, publishJob: undefined, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1, contentAt: now })
  c.contentRev += 1
  return ctx.db.insert('changes', {
    site: entry.site, entry: entry._id, brick: entry.brick, ...by, opId, kind: 'publish', ...history, entryRev: entry.rev + 1, contentRev: c.contentRev, at: now,
  })
}

const publishArgs = {
  site: v.string(),
  opId: v.string(),
  task: v.optional(v.string()),
  entry: v.string(),
  lifeRev: v.number(),
  /** Absent: online now. Present: online at this time (ms, in the future, within a year). */
  at: v.optional(v.number()),
}

export const publish = mutation({ args: publishArgs, handler: async (ctx, args) => publishAs(ctx, await actorFor(ctx, args.site), args) })

/** `publish` for an actor already known: the platform's signed-in person, or the agent door's key (SPEC 16). */
export async function publishAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof publishArgs>) {
  checkRev(args.lifeRev)
  return idempotent(ctx, actor, args, async () => {
    const entry = await entryOf(ctx, actor, args.entry)
    const schema = actor.site.schema as Schema
    structuralBrick(schema, entry.brick)
    authorizeWriter(actor, schema, { task: args.task, brick: entry.brick })
    if (entry.deletedAt || entry.lifeRev !== args.lifeRev) fail('CHANGED_SINCE', 'errors.entryChangedMeanwhile', undefined, lifeStateOf(entry))
    if (stateOf(entry) !== 'draft') fail('INVALID', 'errors.entryAlreadyOnline', undefined, lifeStateOf(entry))
    const late = lapsed(actor, args.at)
    const at = late ? undefined : args.at
    if (at !== undefined) checkFuture(at)
    // Everything the draft holds goes live, so every link in it counts as new (also when it is only scheduled: the job does not check again).
    await checkNewLinks(ctx, actor.site, [{ entry, fields: structuralBrick(schema, entry.brick).fields, before: {}, after: entry.data as Data }])

    const label = labelOf(schema, entry.brick, entry.data as Data)
    if (await needsProposal(ctx, actor, 'publish', args.task, entry.brick, entry)) {
      return await propose(ctx, actor, {
        op: 'publish', brick: entry.brick, entry: entry._id, args: args as unknown as Json, base: { lifeRev: entry.lifeRev },
        before: { state: 'draft' }, after: at === undefined ? { state: 'live' } : { state: 'draft', publishAt: at },
        ...recorded(at === undefined ? msg('history.publishProposal', { title: label }) : msg('history.publishProposalScheduled', { title: label, at }), schema),
      })
    }
    const c = countersOf(actor.site)
    let change: Id<'changes'>
    if (at === undefined) {
      change = await goLive(ctx, c, entry, byOf(actor), args.opId, recorded(msg(late ? 'history.publishedLate' : 'history.published', { title: label }), schema))
    } else {
      // A new time replaces the old job, so the entry never goes online at the old time.
      await cancelJob(ctx, entry)
      const publishJob = await ctx.scheduler.runAt(at, internal.entries.publishDue, { entry: entry._id, at })
      await ctx.db.patch(entry._id, { publishAt: at, publishJob, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1 })
      change = await ctx.db.insert('changes', {
        site: actor.site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId: args.opId, kind: 'schedule',
        ...recorded(msg('history.scheduled', { title: label, at }), schema), entryRev: entry.rev + 1, contentRev: c.contentRev, at: Date.now(),
      })
    }
    await writeCounters(ctx, actor.site._id, c)
    // What the other languages show of the entry that went online now (the Studio's message after publishing, as after a create).
    const translation = at === undefined ? translationNotes(schema, entry.brick, entry, {}, Object.keys(structuralBrick(schema, entry.brick).fields)) : []
    return {
      entry: entry._id, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1, contentRev: c.contentRev, change,
      state: at === undefined ? 'live' : 'draft', ...(at === undefined ? {} : { publishAt: at }), translation,
    }
  })
}

const unpublishArgs = { site: v.string(), opId: v.string(), task: v.optional(v.string()), entry: v.string(), lifeRev: v.number() }

export const unpublish = mutation({ args: unpublishArgs, handler: async (ctx, args) => unpublishAs(ctx, await actorFor(ctx, args.site), args) })

/** `unpublish` for an actor already known: the platform's signed-in person, or the agent door's key (SPEC 16). */
export async function unpublishAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof unpublishArgs>) {
  checkRev(args.lifeRev)
  return idempotent(ctx, actor, args, async () => {
    const entry = await entryOf(ctx, actor, args.entry)
    const schema = actor.site.schema as Schema
    const brick = structuralBrick(schema, entry.brick)
    authorizeWriter(actor, schema, { task: args.task, brick: entry.brick })
    if (entry.deletedAt || entry.lifeRev !== args.lifeRev) fail('CHANGED_SINCE', 'errors.entryChangedMeanwhile', undefined, lifeStateOf(entry))
    if (!brick.drafts) fail('INVALID', 'errors.collectionHasNoDrafts', undefined, { brick: entry.brick })
    const wasLive = stateOf(entry) === 'live'
    if (!wasLive && entry.publishAt === undefined) fail('INVALID', 'errors.entryAlreadyDraft', undefined, lifeStateOf(entry))

    const label = labelOf(schema, entry.brick, entry.data as Data)
    if (await needsProposal(ctx, actor, 'unpublish', args.task, entry.brick, entry)) {
      return await propose(ctx, actor, {
        op: 'unpublish', brick: entry.brick, entry: entry._id, args: args as unknown as Json, base: { lifeRev: entry.lifeRev },
        before: { state: wasLive ? 'live' : 'draft' }, after: { state: 'draft' },
        ...recorded(msg(wasLive ? 'history.unpublishProposal' : 'history.unscheduleProposal', { title: label }), schema),
      })
    }

    const c = countersOf(actor.site)
    await cancelJob(ctx, entry)
    await ctx.db.patch(entry._id, { state: 'draft', publishAt: undefined, publishJob: undefined, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1 })
    // Only a live entry leaves the bundle; a scheduled draft was never in it.
    if (wasLive) c.contentRev += 1
    const change = await ctx.db.insert('changes', {
      site: actor.site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId: args.opId, kind: 'unpublish',
      ...recorded(msg(wasLive ? 'history.unpublished' : 'history.unscheduled', { title: label }), schema), entryRev: entry.rev + 1, contentRev: c.contentRev, at: Date.now(),
    })
    await writeCounters(ctx, actor.site._id, c)
    return { entry: entry._id, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1, contentRev: c.contentRev, change, state: 'draft' }
  })
}

/**
 * The scheduled job of a draft (SPEC 15): publishes it when it is still a draft with exactly this
 * `publishAt` (a rescheduled, unpublished or removed entry does nothing). The actor is `system`.
 */
export const publishDue = internalMutation({
  args: { entry: v.id('entries'), at: v.number() },
  handler: async (ctx, args): Promise<null> => {
    const entry = await ctx.db.get(args.entry)
    if (!entry || entry.deletedAt || stateOf(entry) !== 'draft' || entry.publishAt !== args.at) return null
    const site = await ctx.db.get(entry.site)
    if (!site || site.deleting) return null
    const c = countersOf(site)
    const schema = site.schema as Schema
    const label = labelOf(schema, entry.brick, entry.data as Data)
    // Links may have broken since it was scheduled. A throwing job would fail silently, so the entry stays a draft and the history says why.
    const broken = await brokenNewLinks(ctx, site, [{ entry, fields: structuralBrick(schema, entry.brick).fields, before: {}, after: entry.data as Data }])
    if (broken) {
      await ctx.db.patch(entry._id, { publishAt: undefined, publishJob: undefined })
      await ctx.db.insert('changes', {
        site: entry.site, entry: entry._id, brick: entry.brick, ...SYSTEM, opId: `publish:${entry._id}:${args.at}`, kind: 'publishStopped',
        ...recorded(msg('history.publishStoppedBrokenLink', { title: label, link: broken.href }), schema), entryRev: entry.rev, contentRev: site.contentRev, at: Date.now(),
      })
      return null
    }
    // The job is running now, so there is nothing left to cancel.
    await goLive(ctx, c, { ...entry, publishJob: undefined }, SYSTEM, `publish:${entry._id}:${args.at}`, recorded(msg('history.publishedDue', { title: label }), site.schema as Schema))
    await writeCounters(ctx, site._id, c)
    return null
  },
})

/**
 * The new order value of `entry` one place up or down: halfway to the live neighbour after the next one, or one past
 * the last. `null`: it is first or last already. `undefined`: no value fits (a live entry shares its order, or the gap
 * between the neighbours is used up); `renumber` makes room.
 */
async function movedOrder(ctx: QueryCtx, entry: Doc<'entries'>, direction: 'up' | 'down'): Promise<number | null | undefined> {
  const tied = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', entry.site).eq('brick', entry.brick).eq('order', entry.order)).collect()
  if (tied.some((row) => row._id !== entry._id && row.deletedAt === undefined)) return undefined
  const rows = ctx.db.query('entries')
    .withIndex('by_site_brick_order', (q) => (direction === 'up' ? q.eq('site', entry.site).eq('brick', entry.brick).lt('order', entry.order) : q.eq('site', entry.site).eq('brick', entry.brick).gt('order', entry.order)))
    .order(direction === 'up' ? 'desc' : 'asc')
  // Removed entries keep their order values (a restore puts them last); they are passed over.
  const live: number[] = []
  for await (const row of rows) {
    if (row.deletedAt !== undefined) continue
    live.push(row.order)
    if (live.length === 2) break
  }
  const [near, far] = live
  if (near === undefined) return null
  const order = far === undefined ? near + (direction === 'up' ? -1 : 1) : (near + far) / 2
  return order === near || order === far ? undefined : order
}

/** Gives the rows of a manual brick the orders 1..n in their current order (sortEntries, removed ones included); only `order` changes. */
async function renumber(ctx: MutationCtx, brick: CollectionBrick, site: Id<'sites'>, key: string) {
  const rows = await rowsOf(ctx, site, key)
  const byId = new Map(rows.map((row) => [row._id as string, row]))
  const sorted = sortEntries(brick, rows.map((row): StoredEntry => ({ id: row._id, order: row.order, data: row.data })))
  for (const [index, stored] of sorted.entries()) {
    const row = byId.get(stored.id)!
    if (row.order !== index + 1) await ctx.db.patch(row._id, { order: index + 1 })
  }
}

/**
 * Moves one entry of a manually ordered collection one place up or down (SPEC 4.2). It writes one order value
 * between the neighbours, so moves by two people at once both apply. Owners and admins only: no task covers it.
 */
export const move = mutation({
  args: { site: v.string(), opId: v.string(), entry: v.string(), direction: v.union(v.literal('up'), v.literal('down')) },
  handler: async (ctx, args): Promise<Json> => {
    const actor = await actorFor(ctx, args.site)
    return idempotent(ctx, actor, args, async () => {
      let entry = await entryOf(ctx, actor, args.entry)
      const schema = actor.site.schema as Schema
      const brick = structuralBrick(schema, entry.brick)
      if (brick.order !== 'manual') fail('INVALID', 'errors.collectionAutoSorted', undefined, { brick: entry.brick })
      // No task covers reordering (SPEC 2.7), so staff may not reorder.
      if (actor.role === 'staff') fail('FORBIDDEN', 'errors.notYourTask')
      if (entry.deletedAt) fail('CHANGED_SINCE', 'errors.thisEntryDeletedSince', undefined, current(entry))

      const c = countersOf(actor.site)
      let order = await movedOrder(ctx, entry, args.direction)
      if (order === undefined) {
        // Rare: equal orders from older data, or about 50 moves into the same gap.
        await renumber(ctx, brick, actor.site._id, entry.brick)
        entry = (await ctx.db.get(entry._id))!
        order = await movedOrder(ctx, entry, args.direction)
      }
      // Already first or last: nothing to do.
      if (order === null || order === undefined) {
        const result: Json = { order: entry.order, contentRev: c.contentRev }
        return result
      }
      await ctx.db.patch(entry._id, { order, rev: entry.rev + 1 })
      c.contentRev += 1
      await ctx.db.insert('changes', {
        site: actor.site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId: args.opId, kind: 'reorder',
        ...recorded(msg('history.reordered', { label: brick.label }), schema), entryRev: entry.rev + 1, contentRev: c.contentRev, at: Date.now(),
      })
      await writeCounters(ctx, actor.site._id, c)
      const result: Json = { order, contentRev: c.contentRev }
      return result
    })
  },
})

/**
 * The live entries that point at an entry through a `ref` field (a single ref, a `multiple` list, a list
 * row), drafts too, in the shape of a file's "Used in" (files.ts), so the Studio shows both lists alike.
 * Removing still works: the entry goes to the trash, and these entries show without it until it is back.
 * The referring bricks are read whole; they are part of the site, which its storage budget bounds.
 * Refs in retired fields are not counted: the website no longer shows them. Any member may read (SPEC 2.7).
 */
export const usedBy = query({
  args: { site: v.string(), entry: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    return usesOfEntry(ctx, actor, await entryOf(ctx, actor, args.entry))
  },
})

/** `usedBy` for an entry of the actor's site already loaded; the agent door's remove names the same uses. */
export async function usesOfEntry(ctx: QueryCtx, actor: Actor, target: Doc<'entries'>) {
  const schema = actor.site.schema as Schema
  const out: { entry: string; brick: string; title: string; paths: string[]; fieldLabels: (Label | null)[]; locale: null; missingAlt: false; deleted: false; state: 'draft' | 'live' }[] = []
  for (const [key, brick] of Object.entries(schema.bricks)) {
    if (brick.retired) continue
    const fields = Object.fromEntries(Object.entries(brick.fields).filter(([, field]) => !field.retired && pointsAt(field, target.brick)))
    if (!Object.keys(fields).length) continue
    const rows = await liveRowsQuery(ctx, actor.site._id, key).collect()
    for (const row of rows) {
      if (row._id === target._id) continue
      const paths = refIdsIn(fields, row.data as Data).filter((ref) => ref.to === target.brick && ref.id === target._id).map((ref) => ref.path)
      if (!paths.length) continue
      out.push({
        entry: row._id, brick: key, title: labelOf(schema, key, row.data as Data), paths, fieldLabels: paths.map((path) => fieldLabelAt(schema, key, path)),
        locale: null, missingAlt: false, deleted: false, state: stateOf(row),
      })
    }
  }
  return out
}

/** A `ref` field to `brick`, or a list with such a column. */
const pointsAt = (field: Field, brick: string): boolean =>
  (field.type === 'ref' && field.to === brick) || (field.type === 'list' && Object.values(field.of).some((inner) => !inner.retired && pointsAt(inner, brick)))

/**
 * Removed entries of a brick that can still be restored (30 days, SPEC 12), newest first, with only what the area list
 * shows: the title (null while untitled, as in `list`) and what a restore needs. Any member may read (SPEC 2.7).
 */
export const removed = query({
  args: { site: v.string(), brick: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    const brick = Object.hasOwn(schema.bricks, args.brick) ? schema.bricks[args.brick] : undefined
    // Absent deletedAt sorts before numbers, so the lower bound keeps live entries out.
    const rows = await ctx.db.query('entries')
      .withIndex('by_site_brick_deleted', (q) => q.eq('site', actor.site._id).eq('brick', args.brick).gt('deletedAt', 0))
      .order('desc')
      .take(100)
    return rows.map((e) => ({ _id: e._id, title: brick ? titleOf(schema, brick, e.data as Data, undefined) : null, lifeRev: e.lifeRev, deletedAt: e.deletedAt! }))
  },
})

// ---- What the Studio's pages read (VOL-1): each page subscribes only to the entries it shows. ----
// Any member may read, as with every Studio read (SPEC 2.7). Each reads only the live rows (by_site_brick_deleted), never
// the brick's trash: one brick's live rows are bounded by SITE_BUDGET (bytes and entries), which keeps a whole-brick
// read inside Convex's per-query limits.

/** A brick of the schema that is not retired. */
function liveBrick(schema: Schema, key: string) {
  const brick = Object.hasOwn(schema.bricks, key) ? schema.bricks[key] : undefined
  if (!brick || brick.retired) fail('INVALID', 'errors.brickNoLongerEditable')
  return brick
}

/** The rows of a brick that are not removed. Index order, not the site's order: sort them when the order matters. */
function liveRowsQuery(ctx: QueryCtx, site: Id<'sites'>, key: string) {
  return ctx.db.query('entries').withIndex('by_site_brick_deleted', (q) => q.eq('site', site).eq('brick', key).eq('deletedAt', undefined))
}

/** The live rows of a brick, in the site's order for a collection (core sortEntries, as on the website). */
async function liveRowsOf(ctx: QueryCtx, site: Id<'sites'>, key: string, brick: Brick): Promise<Doc<'entries'>[]> {
  const rows = await liveRowsQuery(ctx, site, key).collect()
  if (brick.kind !== 'collection') return rows
  const byId = new Map(rows.map((row) => [row._id as string, row]))
  return sortEntries(brick, rows.map((row): StoredEntry => ({ id: row._id, order: row.order, data: row.data }))).map((stored) => byId.get(stored.id)!)
}

/** Rows a list shows at first and adds per "Show more". */
export const LIST_PAGE = 50
/** Longest search text the list takes; more is cut. */
const SEARCH_MAX = 200

/**
 * One collection's list (SPEC 4.2): the live entries in the site's order, narrowed by `search` (every word in a text or
 * longtext field, any language, without accents) and sorted by `sort` (a saved view), the first `limit` of them as
 * small rows (lib/list.ts listRow). `total` counts every match.
 */
export const list = query({
  args: {
    site: v.string(),
    brick: v.string(),
    search: v.optional(v.string()),
    sort: v.optional(v.object({ field: v.string(), dir: v.union(v.literal('asc'), v.literal('desc')) })),
    limit: v.optional(v.number()),
    /** The person's language, for labels inside a title (a planned week's "Woche ab"); default: the site's main language. */
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    const brick = structuralBrick(schema, args.brick)
    const limit = args.limit !== undefined && Number.isFinite(args.limit) ? Math.min(Math.max(Math.floor(args.limit), 1), SITE_BUDGET.entries) : LIST_PAGE
    let rows = await liveRowsOf(ctx, actor.site._id, args.brick, brick)
    const words = searchable((args.search ?? '').trim().slice(0, SEARCH_MAX)).split(/\s+/).filter(Boolean)
    if (words.length) {
      rows = rows.filter((row) => {
        const hay = listHaystack(brick, row.data as Data, schema.locales)
        return words.every((word) => hay.includes(word))
      })
    }
    if (args.sort) rows = listSort(rows, brick, args.sort, schema.locales[0]!)
    return { total: rows.length, rows: rows.slice(0, limit).map((row) => listRow(schema, args.brick, row, args.language)) }
  },
})

/**
 * One entry for an editor, with its translation gaps; `null` when no such entry of this site exists. A removed entry
 * comes back with `deleted: true`, so a form open on it keeps the person's input (N1).
 */
export const get = query({
  args: { site: v.string(), entry: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const id = ctx.db.normalizeId('entries', args.entry)
    const row = id ? await ctx.db.get(id) : null
    if (!row || row.site !== actor.site._id) return null
    // `own`: the person created it, so staff may change it with their create task (lib/access.ts `authorize`).
    return { ...editorEntryWithTranslation(actor.site.schema as Schema, row), ...(createdBy(actor, row) ? { own: true } : {}) }
  },
})

/** The one entry of a single brick for its editor, with its translation gaps; `null` before it exists (and for a collection). */
export const single = query({
  args: { site: v.string(), brick: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    if (liveBrick(schema, args.brick).kind !== 'single') return null
    const row = await liveRowsQuery(ctx, actor.site._id, args.brick).first()
    return row ? editorEntryWithTranslation(schema, row) : null
  },
})

/**
 * The live entries of a brick by title (lib/list.ts titleOf; null while untitled), with their state and the last day
 * they show (`until`, for `visible: until`): what a ref picker, a pick list and the duplicate check need. About 60 B a row.
 * A retired brick still answers: a ref field that points at it keeps showing the titles of the entries it holds.
 */
export const titles = query({
  args: { site: v.string(), brick: v.string(), language: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    const brick = Object.hasOwn(schema.bricks, args.brick) ? schema.bricks[args.brick] : undefined
    if (!brick) fail('INVALID', 'errors.brickNoLongerEditable')
    return (await liveRowsOf(ctx, actor.site._id, args.brick, brick)).map((row) => {
      const until = visibleUntil(brick, row.data as Data)
      return {
        _id: row._id,
        title: titleOf(schema, brick, row.data as Data, args.language),
        ...(row.state === undefined ? {} : { state: row.state }),
        ...(until === undefined ? {} : { until }),
      }
    })
  },
})

/**
 * The live entries of the named bricks for an editor (lib/list.ts editorEntry), each collection in the site's order:
 * Schnell ändern's sections and the preview, which builds the site from them. Names the schema lacks are skipped.
 * `slim`: collection entries carry only their titles and dates (lib/list.ts slimEntry), as Schnell ändern needs.
 */
export const ofBricks = query({
  args: { site: v.string(), bricks: v.array(v.string()), slim: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    const out = []
    for (const key of new Set(args.bricks)) {
      const brick = Object.hasOwn(schema.bricks, key) ? schema.bricks[key]! : undefined
      if (!brick) continue
      for (const row of await liveRowsOf(ctx, actor.site._id, key, brick)) {
        const entry = args.slim && brick.kind === 'collection' ? slimEntry(brick, row) : editorEntry(row)
        // A draft says since when it exists and whether the person made it: Heute lists a person's own drafts (staff see no others).
        out.push(row.state === 'draft' ? { ...entry, since: row._creationTime, ...(createdBy(actor, row) ? { own: true } : {}) } : entry)
      }
    }
    return out
  },
})

const TRASH_PAGE = 50
/** Bytes of removed entries one trash page reads at most (as changes.list): fewer rows when they are large. */
const TRASH_PAGE_BYTES = 2 * 1024 * 1024

/** The collections whose removed entries the trash shows (not retired ones); `only` narrows them to one. */
const trashBricks = (schema: Schema, only?: string) =>
  Object.entries(schema.bricks).filter(([key, def]) => def.kind === 'collection' && !def.retired && (only === undefined || only === key)).map(([key]) => key)

/**
 * The trash (SPEC 12): removed entries that can still be restored, newest first, across bricks or in one. A
 * paginated query (`useConvexPaginatedQuery`), at most 50 entries a page. Any member may read; `mayRestore` says
 * whether this person can use `restore` (staff needs the remove task, and it must not need approval).
 */
export const trash = query({
  args: { site: v.string(), brick: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    if (args.brick !== undefined && !(Object.hasOwn(schema.bricks, args.brick) && schema.bricks[args.brick]!.kind === 'collection')) fail('INVALID', 'errors.brickNotFound')
    const site = actor.site._id
    const brick = args.brick
    const keys = trashBricks(schema, brick)
    // Absent deletedAt sorts before numbers, so the lower bound keeps live entries out.
    const rows = (brick === undefined
      ? ctx.db.query('entries').withIndex('by_site_deleted', (q) => q.eq('site', site).gt('deletedAt', 0))
      : ctx.db.query('entries').withIndex('by_site_brick_deleted', (q) => q.eq('site', site).eq('brick', brick).gt('deletedAt', 0)))
      .filter((q) => (keys.length ? q.or(...keys.map((key) => q.eq(q.field('brick'), key))) : false))
      .order('desc')
    const opts = args.paginationOpts
    let result
    try {
      result = await rows.paginate({ ...opts, numItems: Math.min(opts.numItems, TRASH_PAGE), maximumBytesRead: TRASH_PAGE_BYTES })
    } catch (error) {
      // The cursor comes from the client; the database refuses one it did not hand out.
      if (opts.cursor === null) throw error
      fail('INVALID', 'errors.pageMarkerInvalid')
    }

    const page = await Promise.all(result.page.map(async (row) => {
      // Every write refuses a removed entry, so its newest change is the removal (none after an import). Older changes
      // can hold the full before and after of a 480 KiB entry: reading them made the page pass Convex's read limit.
      const newest = await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', row._id)).order('desc').first()
      const removal = newest?.kind === 'remove' ? newest : undefined
      const member = removal && removal.actor !== 'system'
        ? await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', removal.actor).eq('site', actor.site._id)).unique()
        : null
      const task = actor.role === 'staff' ? taskFor(actor, row.brick, 'remove') : undefined
      return {
        entry: row._id, brick: row.brick, brickLabel: labelIn(schema.bricks[row.brick]!.label, schema.locales[0]!, schema.locales[0]!), label: labelOf(schema, row.brick, row.data as Data),
        lifeRev: row.lifeRev, deletedAt: row.deletedAt!, purgeAt: row.deletedAt! + DELETED_KEPT, wasDraft: row.state === 'draft',
        deletedBy: removal ? { actor: removal.actor, ...(member?.email ? { email: member.email } : {}), ...(removal.via ? { via: removal.via } : {}) } : null,
        mayRestore: actor.role !== 'staff' || (task !== undefined && !directWriteRefused(actor, row.brick, task)),
        mayPurge: actor.role !== 'staff',
        ...(task === undefined ? {} : { task }),
      }
    }))
    return { ...result, page }
  },
})

/**
 * The removed entries that removing `entry` now would delete for good, oldest first, because the trash would pass
 * SITE_BUDGET.trashBytes (lib/lifecycle softRemove): the remove question names them. Usually none. Any member may ask.
 */
export const trashOverflow = query({
  args: { site: v.string(), entry: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const entry = await entryOf(ctx, actor, args.entry)
    if (entry.deletedAt) return []
    const schema = actor.site.schema as Schema
    const rows = await overflowingTrash(ctx, actor.site._id, (actor.site.trashBytes ?? 0) + entry.bytes)
    return rows.map((row) => ({ entry: row._id, brick: row.brick, title: labelOf(schema, row.brick, row.data as Data) }))
  },
})

/** Why an entry is not on the website in a language (default: the main language), in plain German. Any member may ask. */
export const whyNotPublic = query({
  args: { site: v.string(), entry: v.string(), locale: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const entry = await entryOf(ctx, actor, args.entry)
    const schema = actor.site.schema as Schema
    const locale = schema.locales.find((l) => l === (args.locale ?? schema.locales[0]))
    if (!locale) fail('INVALID', 'errors.languageNotOnSite', { locale: args.locale ?? '' })
    if (!Object.hasOwn(schema.bricks, entry.brick)) fail('NOT_FOUND', 'errors.entryNotFound')
    return { locale, ...publicness(actor.site, entry.brick, entry, locale) }
  },
})

/** Change kinds that alter what the public bundle shows: before `contentAt`, the newest of them was an entry's `updatedAt`. */
const CONTENT_KINDS = new Set(['create', 'save', 'confirm', 'undo', 'restore', 'publish'])

/**
 * Brings every entry to the storage model of now (internals/migrations.md) and writes its Markdown trees again
 * from its data, also after a parser change (a row keeps the trees of the parser it was saved with). Per entry:
 * `bytes` = core `entryBytes`, the trees into `entryTrees` (none in the trash), `treeBytes`, no legacy `trees`, and
 * `contentAt` from its change history when it has none. Works through 10 entries at a time and schedules itself;
 * then `recountStorage` sets every site's counters to the sums. Running it again is safe. Entries of a brick the
 * schema no longer has keep the trees they have.
 */
export const migrateStorage = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<null> => {
    const page = await ctx.db.query('entries').paginate({ cursor: args.cursor ?? null, numItems: 10 })
    const sites = new Map<Id<'sites'>, Doc<'sites'> | null>()
    const changed = new Set<Id<'sites'>>()
    for (const row of page.page) {
      if (!sites.has(row.site)) sites.set(row.site, await ctx.db.get(row.site))
      const schema = sites.get(row.site)?.schema as Schema | undefined
      const brick = schema && Object.hasOwn(schema.bricks, row.brick) ? schema.bricks[row.brick]! : undefined
      const stored = row.trees ?? await readTreesJson(ctx, row._id)
      const json = row.deletedAt !== undefined ? '' : brick ? (await treesOf(brick.fields, row.data as Data)).json : stored
      const treeBytes = new TextEncoder().encode(json).byteLength
      const bytes = entryBytes(row.data, row.prints)
      let contentAt = row.contentAt
      if (contentAt === undefined) {
        const recent = await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', row._id)).order('desc').take(10)
        contentAt = recent.find((change) => CONTENT_KINDS.has(change.kind))?.at ?? row._creationTime
      }
      if (json === stored && row.trees === undefined && bytes === row.bytes && treeBytes === row.treeBytes && contentAt === row.contentAt) continue
      await ctx.db.patch(row._id, { bytes, treeBytes, contentAt, trees: undefined })
      if (json !== stored || row.trees !== undefined) await putTrees(ctx, row.site, row._id, json)
      // New trees change what the bundle serves: its caches must refresh.
      if (json !== stored && row.deletedAt === undefined && row.state !== 'draft') changed.add(row.site)
    }
    for (const id of changed) {
      const site = sites.get(id)
      if (site) await ctx.db.patch(id, { contentRev: site.contentRev + 1 })
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.entries.migrateStorage, { cursor: page.continueCursor })
    else await ctx.scheduler.runAfter(0, internal.entries.recountStorage, {})
    return null
  },
})

/** The last step of `migrateStorage`: per site (one per run), `bytes`, `trashBytes` and `treeBytes` become the sums over its entries. */
export const recountStorage = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<null> => {
    const page = await ctx.db.query('sites').paginate({ cursor: args.cursor ?? null, numItems: 1 })
    for (const site of page.page) {
      const rows = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id)).collect()
      await ctx.db.patch(site._id, storageSums(rows))
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.entries.recountStorage, { cursor: page.continueCursor })
    return null
  },
})

/**
 * Read-only check after `migrateStorage`, one site per call (repeat with `cursor` until `isDone`): entries that still
 * hold legacy `trees` or have no `contentAt`, counters that differ from the sums over the entries, and entries over
 * the entry limit (expected: none of each).
 */
export const storageStatus = internalQuery({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query('sites').paginate({ cursor: args.cursor ?? null, numItems: 1 })
    const sites = []
    for (const site of page.page) {
      const rows = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id)).collect()
      const sums = storageSums(rows)
      const counters = { bytes: site.bytes, trashBytes: site.trashBytes, treeBytes: site.treeBytes }
      sites.push({
        site: site.slug,
        legacyRows: rows.filter((row) => row.trees !== undefined || row.contentAt === undefined || row.treeBytes === undefined).length,
        countersMatch: counters.bytes === sums.bytes && counters.trashBytes === sums.trashBytes && counters.treeBytes === sums.treeBytes,
        counters,
        sums,
        overLimit: rows.filter((row) => entryBytes(row.data, row.prints) > BUDGET.entryBytes).map((row) => row._id),
      })
    }
    return { sites, cursor: page.continueCursor, isDone: page.isDone }
  },
})
