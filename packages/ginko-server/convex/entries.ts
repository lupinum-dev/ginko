// Entry operations (SPEC 4.2). `save` is the reference for the shared flow of SPEC 4.1:
// actor → repeated op → load → may they → precondition → check → write → record op.
import type { Brick, CollectionBrick, Field, Fields, Json, Label, Locale } from '@lupinum/ginko'
import { blockedSlugs, effectiveMax, isTranslatable, labelOf as labelIn, isVisible, ordered, sha256, slugify, todayIn, uniqueSlug, validate, type Schema } from '@lupinum/ginko/internal'
import { v, type ObjectType } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { internal } from './_generated/api'
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { actorFor, authorize, authorizeWriter, byOf, checkRev, entryOf, fail, idempotent, SYSTEM, taskBrickOf, type Actor, type By } from './lib/access'
import { byteSize, fileIdsOf, leavesOf, mergeField, nextPrints, rootOf, withoutLocale, type Data, type Prints } from './lib/content'
import { msg, recorded, type HistoryMsg, type Recorded } from './lib/history'
import { isLocale, t } from './lib/i18n'
import { countersOf, DELETED_KEPT, softRemove, writeCounters, type Counters } from './lib/lifecycle'
import { directWriteRefused, needsProposal, propose, refuseAgentUndo, refuseDirectWrite } from './lib/policy'
import { publicness } from './lib/publicness'
import { taskFor } from './lib/agentTools'
import { BUDGET, checkFiles, checkNewFiles, brokenNewLinks, checkNewLinks, commitEntry, entryUses, lookupsFor, same, syncEntryRefs, syncFileRefs } from './lib/write'

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
export async function saveAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof saveArgs>): Promise<Json> {
  checkRev(args.baseRev)
  return idempotent(ctx, actor, args, () => saveNow(ctx, actor, args))
}

/**
 * The history line of a save, built from what changed: "{brick}: {fields} changed" for a single,
 * "{fields} changed in “{title}”" for an entry. The field names are one label per locale, joined, so every
 * reader gets their own language. The title is the entry's before the save, like the Studio showed it.
 */
function saveMsg(schema: Schema, brick: Schema['bricks'][string], entry: Doc<'entries'>, roots: string[], onlyConfirm: boolean): HistoryMsg {
  if (onlyConfirm) return msg('history.translationConfirmed')
  const main = schema.locales[0]!
  const fields: Label = Object.fromEntries(schema.locales.map((l) => [l, roots.map((k) => labelIn(brick.fields[k]!.label, l, main)).join(', ')]))
  return brick.kind === 'single'
    ? msg('history.changedSingle', { label: brick.label, fields })
    : msg('history.changedEntry', { fields, title: labelOf(schema, entry.brick, entry.data as Data) })
}

/** The save itself, steps 3 to 7 of SPEC 4.1 without the repeated-op step: `revert` wraps it in its own and words the line (`line`). */
async function saveNow(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof saveArgs>, line?: HistoryMsg): Promise<Json> {
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
  authorize(actor, schema, { task: args.task, brick: taskBrick, kind: 'edit', fields: roots })

  if (entry.deletedAt) fail('CHANGED_SINCE', 'errors.thisEntryDeletedSince', undefined, current(entry))
  // A base above the entry's revision was never read, so it cannot vouch for anything.
  if (args.baseRev > entry.rev) fail('CHANGED_SINCE', 'errors.someoneChangedMeanwhile', undefined, current(entry))
  const conflicts = roots.filter((r) => (entry.fieldRevs[r] ?? 0) > args.baseRev)
  if (conflicts.length) fail('CHANGED_SINCE', 'errors.someoneChangedMeanwhile', undefined, { ...(current(entry) as object), conflicts })

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
  for (const leaf of confirm) {
    if (!leavesOf(brick.fields[rootOf(leaf)]!, data[rootOf(leaf)], rootOf(leaf)).has(leaf)) fail('INVALID', 'errors.leafNotTranslatable', { leaf }, { leaf })
  }
  const prints = nextPrints({ fields: brick.fields, roots, before, after: data, prints: entry.prints, main, confirm: confirm.length ? { locale: locale!, leaves: confirm } : undefined })

  // A root counts as changed when its value or one of its prints changed.
  const printsOf = (p: Prints, root: string) => Object.fromEntries(Object.entries(p).filter(([leaf]) => underRoot(leaf, root)))
  const changed = roots.filter((r) => !same(data[r], before[r]) || !same(printsOf(prints, r), printsOf(entry.prints, r)))
  if (!changed.length) {
    const result: Json = { entry: entry._id, rev: entry.rev, contentRev: actor.site.contentRev, warnings: [] }
    return result
  }

  const { errors, warnings } = await validate(schema, entry.brick, data, { mode: 'patch', changed: new Set(Object.keys(args.fields)), ...(await lookupsFor(ctx, actor.site._id, brick.fields, data)) })
  if (errors.length) fail('INVALID', 'errors.pleaseCheckMarkedFields', undefined, { errors: errors as unknown as Json })
  await checkNewFiles(ctx, actor.site._id, brick.fields, before, data)
  // A draft is not online yet: its links are checked when it goes live.
  if (stateOf(entry) === 'live') await checkNewLinks(ctx, actor.site, [{ entry, fields: brick.fields, before, after: data }])

  const onlyConfirm = Object.keys(args.fields).length === 0
  const history = recorded(line ?? saveMsg(schema, brick, entry, changed, onlyConfirm), schema)

  // Everything is checked: a change that needs a yes becomes a proposal and writes nothing (SPEC 17).
  if (await needsProposal(ctx, actor, 'save', args.task, taskBrick, entry)) {
    const pick = (d: Data) => Object.fromEntries(changed.filter((r) => d[r] !== undefined).map((r) => [r, d[r]!]))
    const result: Json = await propose(ctx, actor, {
      op: 'save', brick: entry.brick, entry: entry._id, args: args as unknown as Json,
      base: { rev: entry.rev, fieldRevs: Object.fromEntries(changed.map((r) => [r, entry.fieldRevs[r] ?? 0])) },
      before: pick(before) as Json, after: pick(data) as Json, ...history,
    })
    return result
  }

  const written = await commitEntry(ctx, {
    actor, entry, fields: brick.fields, roots: changed, data, prints,
    kind: onlyConfirm ? 'confirm' : 'save', history, opId: args.opId,
  })
  const result: Json = { entry: entry._id, rev: written.rev, contentRev: written.contentRev, change: written.change, warnings: warnings as unknown as Json }
  return result
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
    if (change.kind !== 'save' || !change.entry || change.undoneBy) fail('NOT_UNDOABLE', 'errors.changeNotUndoable')
    const entry = await entryOf(ctx, actor, change.entry)
    const schema = actor.site.schema as Schema
    const brick = brickOf(schema, entry)
    const roots = change.fields ?? []
    const taskBrick = taskBrickOf(schema, args.task, entry)
    authorize(actor, schema, { task: args.task, brick: taskBrick, kind: 'edit', fields: roots })
    refuseDirectWrite(actor, taskBrick, args.task)
    await refuseAgentUndo(ctx, actor, entry)

    if (entry.deletedAt) fail('NOT_UNDOABLE', 'errors.entryDeletedSince')
    if (roots.some((r) => entry.fieldRevs[r] !== change.entryRev)) fail('CHANGED_SINCE', 'errors.someoneChangedMeanwhileNoUndo', undefined, current(entry))
    const migrated = await ctx.db.query('migrationsApplied').withIndex('by_site_id', (q) => q.eq('site', actor.site._id)).collect()
    if (migrated.some((m) => m.brick === entry.brick && m._creationTime > change.at)) fail('NOT_UNDOABLE', 'errors.schemaChangedSinceChange')

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

    const { errors } = await validate(schema, entry.brick, data, { mode: 'patch', changed: new Set(roots), ...(await lookupsFor(ctx, actor.site._id, brick.fields, data)) })
    if (errors.length) fail('NOT_UNDOABLE', 'errors.oldVersionNoLongerFitsSchema', undefined, { errors: errors as unknown as Json })
    await checkNewFiles(ctx, actor.site._id, brick.fields, entry.data as Data, data)
    if (stateOf(entry) === 'live') await checkNewLinks(ctx, actor.site, [{ entry, fields: brick.fields, before: entry.data as Data, after: data }])

    const written = await commitEntry(ctx, {
      actor, entry, fields: brick.fields, roots, data, prints, kind: 'undo', history: recorded(msg('history.undo', { what: change.msg ? (change.msg as HistoryMsg) : change.sentence }), schema), opId: args.opId,
    })
    await ctx.db.patch(change._id, { undoneBy: written.change })
    const result: Json = { entry: entry._id, rev: written.rev, contentRev: written.contentRev, warnings: [] }
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

/** `versionAt` for an actor already known: the platform's signed-in person, or the agent door's key (SPEC 16). */
export async function versionAtAs(ctx: QueryCtx, actor: Actor, args: { entry: string; change: string }): Promise<Json> {
  const { entry, change, data, touched } = await versionOf(ctx, actor, args.entry, args.change)
  const result: Json = { entry: entry._id, change: change._id, at: change.at, data, fields: touched }
  return result
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
export async function revertAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof revertArgs>): Promise<Json> {
  return idempotent(ctx, actor, args, async () => {
    const { entry, change, data, touched } = await versionOf(ctx, actor, args.entry, args.change)
    if (entry.deletedAt) fail('INVALID', 'errors.entryDeletedRestoreFirst')
    const schema = actor.site.schema as Schema
    const brick = brickOf(schema, entry)
    const now = entry.data as Data
    const fields: Record<string, Json> = {}
    for (const root of touched) {
      // A field the schema no longer has cannot be written; the address is fixed.
      const field = Object.hasOwn(brick.fields, root) ? brick.fields[root] : undefined
      if (!field || field.retired || field.type === 'slug') continue
      if (!same(data[root], now[root])) fields[root] = data[root] ?? null
    }
    if (!Object.keys(fields).length) {
      const result: Json = { entry: entry._id, rev: entry.rev, contentRev: actor.site.contentRev, warnings: [] }
      return result
    }
    return saveNow(ctx, actor, {
      site: args.site, opId: args.opId, ...(args.task === undefined ? {} : { task: args.task }),
      entry: entry._id, baseRev: entry.rev, fields,
    }, msg('history.revert', { when: change.at }))
  })
}

// ---- Structural operations (SPEC 4.2): create, remove, restore, reorder. ----
// They follow the flow of SPEC 4.1 like `save`. The site's counters (contentRev, entryCount,
// bytes, orderRevs) are changed in memory and written back once at the end.

/** Site values one operation changes. `entryCount` counts live entries; `bytes` counts every stored row. */
const plainObject = (value: Json | undefined): Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}

const textOf = (value: Json | undefined): string => (typeof value === 'string' ? value : '')

/** Label of an entry for history lines: its first text field in the main language. */
export function labelOf(schema: Schema, brickKey: string, data: Data): string {
  const brick = Object.hasOwn(schema.bricks, brickKey) ? schema.bricks[brickKey] : undefined
  const main = schema.locales[0]!
  // The first text field in config order (stored objects lose key order), like the editor's titles.
  for (const [name, field] of ordered(brick?.fields ?? {})) {
    if (field.type !== 'text') continue
    const text = textOf(plainObject(data[name])[main] ?? data[name])
    if (text) return text
  }
  return brick ? labelIn(brick.label, main, main) : brickKey
}

function structuralBrick(schema: Schema, key: string): CollectionBrick {
  const brick = Object.hasOwn(schema.bricks, key) ? schema.bricks[key] : undefined
  if (!brick || brick.retired) fail('INVALID', 'errors.brickNoLongerEditable')
  if (brick.kind !== 'collection') fail('INVALID', 'errors.brickNotCollection', undefined, { brick: key })
  return brick
}

/** Every row of a brick in order, deleted ones included: their order values stay in use. */
function rowsOf(ctx: MutationCtx, site: Id<'sites'>, brick: string) {
  return ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site).eq('brick', brick)).collect()
}

const stateOf = (entry: Doc<'entries'>) => entry.state ?? 'live'

/** What the UI needs to show an entry's place in its life: deleted, draft, scheduled or live (SPEC 15). */
const lifeStateOf = (entry: Doc<'entries'>): Json => ({
  entry: entry._id, lifeRev: entry.lifeRev, deleted: !!entry.deletedAt, state: stateOf(entry),
  ...(entry.publishAt === undefined ? {} : { publishAt: entry.publishAt }),
})

/**
 * Slugs of a new entry (SPEC 2.2): per locale from its `from` field, unique in the brick and
 * locale. A missing foreign value takes the main-language slug of the same entry.
 */
async function slugsFor(ctx: MutationCtx, actor: Actor, brick: string, fields: Fields, data: Data) {
  const schema = actor.site.schema as Schema
  const main = schema.locales[0]!
  const out: Data = { ...data }
  const rows: { locale: string; slug: string }[] = []
  for (const [name, field] of Object.entries(fields)) {
    if (field.type !== 'slug') continue
    const from = plainObject(data[field.from])
    const made: Record<string, string> = {}
    for (const locale of schema.locales) {
      const slugsOf = async (key: string) => (await ctx.db.query('slugs').withIndex('by_key', (q) => q.eq('site', actor.site._id).eq('brick', key).eq('locale', locale)).collect()).map((r) => r.slug)
      const taken = new Set(await slugsOf(brick))
      // Other bricks and static pages may own the URL this slug would make.
      const others: Record<string, string[]> = {}
      for (const [key, other] of Object.entries(schema.bricks)) if (key !== brick && other.kind === 'collection' && other.route) others[key] = await slugsOf(key)
      for (const slug of blockedSlugs(schema, brick, locale, others)) taken.add(slug)
      const own = textOf(from[locale])
      const base = locale === main ? slugify(textOf(from[main])) : own ? slugify(own) : made[main]!
      made[locale] = uniqueSlug(base, (s) => taken.has(s))
    }
    out[name] = made
    for (const [locale, slug] of Object.entries(made)) rows.push({ locale, slug })
  }
  return { data: out, slugs: rows }
}

/**
 * Room for one more live entry in a collection (SPEC 4.2 create). Returns the expired entries
 * to remove first, oldest order first; fails when the collection is full and nothing expired.
 */
function roomPlan(actor: Actor, brick: CollectionBrick, rows: Doc<'entries'>[]): Doc<'entries'>[] {
  const live = rows.filter((r) => !r.deletedAt)
  if (live.length < brick.max) return []
  const need = live.length - brick.max + 1
  const today = todayIn((actor.site.schema as Schema).timezone)
  // A draft is never expired: it is not published yet (SPEC 15). It still takes a place in `max`.
  const expired = brick.autoRemoveExpired ? live.filter((r) => r.state !== 'draft' && !isVisible(brick as Brick, r.data, today)) : []
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
export async function createAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof createArgs>): Promise<Json> {
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

    const rows = await rowsOf(ctx, actor.site._id, args.brick)
    const removing = roomPlan(actor, brick, rows)
    const c = countersOf(actor.site)
    if (c.entryCount - removing.length >= BUDGET.entries) fail('TOO_LARGE', 'errors.siteEntryLimitReached')
    const size = byteSize(data) + byteSize(prints)
    if (size > BUDGET.entryBytes) fail('TOO_LARGE', 'errors.entryTooLarge')
    if (c.bytes + size > BUDGET.siteBytes) fail('TOO_LARGE', 'errors.siteStorageLimitReached')
    const files = fileIdsOf(brick.fields, data)
    await checkFiles(ctx, actor.site._id, files, fileIdsOf(brick.fields, data, 'image'))
    // Without `drafts` an entry is always live. With it, only `publish: {}` goes live at once.
    const draft = brick.drafts === true && (args.publish === undefined || args.publish.at !== undefined)
    const at = draft ? args.publish?.at : undefined
    // Checked before anything is written, so a late failure (apply of a proposal) leaves no half-done removal behind.
    if (at !== undefined) checkFuture(at)

    // A plain draft is not live; a live or scheduled entry is (SPEC 17).
    if (await needsProposal(ctx, actor, 'create', args.task, args.brick, { state: draft && at === undefined ? 'draft' : 'live' })) {
      // A proposal that would go live with a broken link is refused now, not only when approved. The entry does not exist yet: it joins the link check under a temporary id.
      if (!draft || at !== undefined) await checkNewLinks(ctx, actor.site, [{ entry: { _id: 'proposed' as Id<'entries'>, brick: args.brick }, fields: brick.fields, before: {}, after: data, isNew: true }])
      const result: Json = await propose(ctx, actor, {
        op: 'create', brick: args.brick, args: args as unknown as Json, base: {}, after: data as Json,
        ...recorded(msg('history.createProposal', { title: labelOf(schema, args.brick, data) }), schema),
      })
      return result
    }

    for (const expired of removing) {
      await softRemove(ctx, c, expired, args.opId, SYSTEM, recorded(msg('history.expiredRemoved', { title: labelOf(schema, args.brick, expired.data) }), schema))
    }
    const order = Math.max(0, ...rows.map((r) => r.order)) + 1
    const entry = await ctx.db.insert('entries', {
      site: actor.site._id, brick: args.brick, kind: 'item', order, data, rev: 1,
      fieldRevs: Object.fromEntries(Object.keys(brick.fields).map((name) => [name, 1])), lifeRev: 1, prints, bytes: size,
      ...(draft ? { state: 'draft' as const } : {}),
    })
    if (at !== undefined) await ctx.db.patch(entry, { publishAt: at, publishJob: await ctx.scheduler.runAt(at, internal.entries.publishDue, { entry, at }) })
    for (const row of slugged.slugs) {
      await ctx.db.insert('slugs', { site: actor.site._id, brick: args.brick, locale: row.locale, slug: row.slug, entry })
    }
    // A live or scheduled entry puts its links online; checked after the insert so its own URL is known (a failure undoes the whole create).
    if (!draft || at !== undefined) await checkNewLinks(ctx, actor.site, [{ entry: (await ctx.db.get(entry))!, fields: brick.fields, before: {}, after: data }])
    c.entryCount += 1
    c.bytes += size
    if (!draft) c.contentRev += 1
    c.orderRevs[args.brick] = (c.orderRevs[args.brick] ?? 0) + 1
    const label = labelOf(schema, args.brick, data)
    const change = await ctx.db.insert('changes', {
      site: actor.site._id, entry, brick: args.brick, ...byOf(actor), opId: args.opId, kind: 'create',
      ...recorded(!draft ? msg('history.created', { title: label }) : at === undefined ? msg('history.draftCreated', { title: label }) : msg('history.draftCreatedScheduled', { title: label, at }), schema),
      after: data, entryRev: 1, contentRev: c.contentRev, at: Date.now(),
    })
    await syncEntryRefs(ctx, actor.site._id, entry, await entryUses(ctx, brick.fields, data, schema.locales))
    if (files.size) await syncFileRefs(ctx, actor.site._id, 'change', change, files)
    await writeCounters(ctx, actor.site._id, c)

    const result: Json = { entry, rev: 1, contentRev: c.contentRev, state: draft ? 'draft' : 'live', ...(at === undefined ? {} : { publishAt: at }) }
    return result
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
export async function duplicateAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof duplicateArgs>): Promise<Json> {
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
export async function removeAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof removeArgs>): Promise<Json> {
  checkRev(args.lifeRev)
  return idempotent(ctx, actor, args, async () => {
    const entry = await entryOf(ctx, actor, args.entry)
    const schema = actor.site.schema as Schema
    structuralBrick(schema, entry.brick)
    authorize(actor, schema, { task: args.task, brick: entry.brick, kind: 'remove' })
    if (entry.deletedAt || entry.lifeRev !== args.lifeRev) fail('CHANGED_SINCE', 'errors.entryChangedMeanwhile', undefined, lifeStateOf(entry))

    const label = labelOf(schema, entry.brick, entry.data as Data)
    if (await needsProposal(ctx, actor, 'remove', args.task, entry.brick, entry)) {
      const result: Json = await propose(ctx, actor, {
        op: 'remove', brick: entry.brick, entry: entry._id, args: args as unknown as Json, base: { lifeRev: entry.lifeRev },
        before: entry.data as Json, ...recorded(msg('history.removeProposal', { title: label }), schema),
      })
      return result
    }

    const c = countersOf(actor.site)
    await softRemove(ctx, c, entry, args.opId, byOf(actor), recorded(msg('history.removed', { title: label }), schema))
    await writeCounters(ctx, actor.site._id, c)
    // The new lifeRev lets the UI undo this at once (restore after remove, remove after restore).
    const result: Json = { entry: entry._id, contentRev: c.contentRev, lifeRev: entry.lifeRev + 1 }
    return result
  })
}

export const restore = mutation({
  args: { site: v.string(), opId: v.string(), task: v.optional(v.string()), entry: v.string(), lifeRev: v.number() },
  handler: async (ctx, args): Promise<Json> => {
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
      const c = countersOf(actor.site)
      if (c.entryCount >= BUDGET.entries) fail('TOO_LARGE', 'errors.siteEntryLimitReached')

      const order = Math.max(0, ...rows.map((r) => r.order)) + 1
      await ctx.db.patch(entry._id, { deletedAt: undefined, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1, order })
      c.entryCount += 1
      // A restored draft stays out of the bundle (its schedule went with the removal).
      if (entry.state !== 'draft') c.contentRev += 1
      c.orderRevs[entry.brick] = (c.orderRevs[entry.brick] ?? 0) + 1
      await ctx.db.insert('changes', {
        site: actor.site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId: args.opId, kind: 'restore',
        ...recorded(msg('history.restored', { title: labelOf(schema, entry.brick, entry.data as Data) }), schema), entryRev: entry.rev + 1, contentRev: c.contentRev, at: Date.now(),
      })
      await writeCounters(ctx, actor.site._id, c)
      // The new lifeRev lets the UI undo this at once (restore after remove, remove after restore).
      const result: Json = { entry: entry._id, contentRev: c.contentRev, lifeRev: entry.lifeRev + 1 }
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

async function cancelJob(ctx: MutationCtx, entry: Doc<'entries'>) {
  if (entry.publishJob) await ctx.scheduler.cancel(entry.publishJob)
}

/** Draft → live: state, no schedule, lifeRev+1, contentRev+1 and one 'publish' change. Shared by `publishAs` and `publishDue`. */
async function goLive(ctx: MutationCtx, c: Counters, entry: Doc<'entries'>, by: By, opId: string, history: Recorded, now = Date.now()) {
  await cancelJob(ctx, entry)
  await ctx.db.patch(entry._id, { state: 'live', publishAt: undefined, publishJob: undefined, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1 })
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
export async function publishAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof publishArgs>): Promise<Json> {
  checkRev(args.lifeRev)
  return idempotent(ctx, actor, args, async () => {
    const entry = await entryOf(ctx, actor, args.entry)
    const schema = actor.site.schema as Schema
    structuralBrick(schema, entry.brick)
    authorizeWriter(actor, schema, { task: args.task, brick: entry.brick })
    if (entry.deletedAt || entry.lifeRev !== args.lifeRev) fail('CHANGED_SINCE', 'errors.entryChangedMeanwhile', undefined, lifeStateOf(entry))
    if (stateOf(entry) !== 'draft') fail('INVALID', 'errors.entryAlreadyOnline', undefined, lifeStateOf(entry))
    if (args.at !== undefined) checkFuture(args.at)
    // Everything the draft holds goes live, so every link in it counts as new (also when it is only scheduled: the job does not check again).
    await checkNewLinks(ctx, actor.site, [{ entry, fields: structuralBrick(schema, entry.brick).fields, before: {}, after: entry.data as Data }])

    const label = labelOf(schema, entry.brick, entry.data as Data)
    if (await needsProposal(ctx, actor, 'publish', args.task, entry.brick, entry)) {
      const result: Json = await propose(ctx, actor, {
        op: 'publish', brick: entry.brick, entry: entry._id, args: args as unknown as Json, base: { lifeRev: entry.lifeRev },
        before: { state: 'draft' }, after: args.at === undefined ? { state: 'live' } : { state: 'draft', publishAt: args.at },
        ...recorded(args.at === undefined ? msg('history.publishProposal', { title: label }) : msg('history.publishProposalScheduled', { title: label, at: args.at }), schema),
      })
      return result
    }
    const c = countersOf(actor.site)
    let change: Id<'changes'>
    if (args.at === undefined) {
      change = await goLive(ctx, c, entry, byOf(actor), args.opId, recorded(msg('history.published', { title: label }), schema))
    } else {
      // A new time replaces the old job, so the entry never goes online at the old time.
      await cancelJob(ctx, entry)
      const publishJob = await ctx.scheduler.runAt(args.at, internal.entries.publishDue, { entry: entry._id, at: args.at })
      await ctx.db.patch(entry._id, { publishAt: args.at, publishJob, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1 })
      change = await ctx.db.insert('changes', {
        site: actor.site._id, entry: entry._id, brick: entry.brick, ...byOf(actor), opId: args.opId, kind: 'schedule',
        ...recorded(msg('history.scheduled', { title: label, at: args.at }), schema), entryRev: entry.rev + 1, contentRev: c.contentRev, at: Date.now(),
      })
    }
    await writeCounters(ctx, actor.site._id, c)
    const result: Json = {
      entry: entry._id, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1, contentRev: c.contentRev, change,
      state: args.at === undefined ? 'live' : 'draft', ...(args.at === undefined ? {} : { publishAt: args.at }),
    }
    return result
  })
}

const unpublishArgs = { site: v.string(), opId: v.string(), task: v.optional(v.string()), entry: v.string(), lifeRev: v.number() }

export const unpublish = mutation({ args: unpublishArgs, handler: async (ctx, args) => unpublishAs(ctx, await actorFor(ctx, args.site), args) })

/** `unpublish` for an actor already known: the platform's signed-in person, or the agent door's key (SPEC 16). */
export async function unpublishAs(ctx: MutationCtx, actor: Actor, args: ObjectType<typeof unpublishArgs>): Promise<Json> {
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
      const result: Json = await propose(ctx, actor, {
        op: 'unpublish', brick: entry.brick, entry: entry._id, args: args as unknown as Json, base: { lifeRev: entry.lifeRev },
        before: { state: wasLive ? 'live' : 'draft' }, after: { state: 'draft' },
        ...recorded(msg(wasLive ? 'history.unpublishProposal' : 'history.unscheduleProposal', { title: label }), schema),
      })
      return result
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
    const result: Json = { entry: entry._id, lifeRev: entry.lifeRev + 1, rev: entry.rev + 1, contentRev: c.contentRev, change, state: 'draft' }
    return result
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
    if (!site) return null
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

export const reorder = mutation({
  args: { site: v.string(), opId: v.string(), brick: v.string(), order: v.array(v.string()), orderRev: v.number() },
  handler: async (ctx, args): Promise<Json> => {
    const actor = await actorFor(ctx, args.site)
    checkRev(args.orderRev)
    return idempotent(ctx, actor, args, async () => {
      const schema = actor.site.schema as Schema
      const brick = structuralBrick(schema, args.brick)
      if (brick.order !== 'manual') fail('INVALID', 'errors.collectionAutoSorted', undefined, { brick: args.brick })
      // No task covers reordering (SPEC 2.7), so staff may not reorder.
      if (actor.role === 'staff') fail('FORBIDDEN', 'errors.notYourTask')

      const entries: Doc<'entries'>[] = []
      for (const id of args.order) {
        const entry = await entryOf(ctx, actor, id)
        if (entry.brick !== args.brick) fail('INVALID', 'errors.entryBelongsToOtherBrick', undefined, { entry: id })
        entries.push(entry)
      }
      const c = countersOf(actor.site)
      const orderRev = c.orderRevs[args.brick] ?? 0
      if (orderRev !== args.orderRev) fail('CHANGED_SINCE', 'errors.orderChangedMeanwhile', undefined, { orderRev })
      if (new Set(args.order).size !== args.order.length) fail('INVALID', 'errors.entryListedTwice')
      if (entries.some((e) => e.deletedAt)) fail('INVALID', 'errors.deletedEntryInList')
      const live = (await rowsOf(ctx, actor.site._id, args.brick)).filter((r) => !r.deletedAt)
      if (live.length !== args.order.length) fail('INVALID', 'errors.listMustContainAllEntries', undefined, { expected: live.length })

      // Rows come in order, so an unchanged list is the same list in the same sequence.
      if (live.every((row, index) => row._id === entries[index]!._id)) {
        const result: Json = { orderRev, contentRev: c.contentRev }
        return result
      }
      for (const [index, entry] of entries.entries()) {
        if (entry.order !== index + 1) await ctx.db.patch(entry._id, { order: index + 1, rev: entry.rev + 1 })
      }
      c.orderRevs[args.brick] = orderRev + 1
      c.contentRev += 1
      await ctx.db.insert('changes', {
        site: actor.site._id, brick: args.brick, ...byOf(actor), opId: args.opId, kind: 'reorder',
        ...recorded(msg('history.reordered', { label: brick.label }), schema), contentRev: c.contentRev, at: Date.now(),
      })
      await writeCounters(ctx, actor.site._id, c)
      const result: Json = { orderRev: orderRev + 1, contentRev: c.contentRev }
      return result
    })
  },
})

/** Removed entries of a brick that can still be restored (30 days, SPEC 12), newest first. Any member may read (SPEC 2.7). */
export const removed = query({
  args: { site: v.string(), brick: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    // Absent deletedAt sorts before numbers, so the lower bound keeps live entries out.
    const rows = await ctx.db.query('entries')
      .withIndex('by_site_brick_deleted', (q) => q.eq('site', actor.site._id).eq('brick', args.brick).gt('deletedAt', 0))
      .order('desc')
      .take(100)
    return rows.map((e) => ({ _id: e._id, data: e.data, lifeRev: e.lifeRev, deletedAt: e.deletedAt! }))
  },
})

const TRASH_PAGE = 50

/**
 * The trash (SPEC 12): removed entries that can still be restored, newest first, across bricks or in
 * one. `cursor` is the `nextCursor` of the page before. Any member may read; `mayRestore` says
 * whether this person can use `restore` (staff needs the remove task, and it must not need approval).
 */
export const trash = query({
  args: { site: v.string(), brick: v.optional(v.string()), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const schema = actor.site.schema as Schema
    if (args.brick !== undefined && !(Object.hasOwn(schema.bricks, args.brick) && schema.bricks[args.brick]!.kind === 'collection')) fail('INVALID', 'errors.brickNotFound')
    const cursor = args.cursor === undefined ? undefined : /^(\d+):(.+)$/.exec(args.cursor)
    if (args.cursor !== undefined && !cursor) fail('INVALID', 'errors.cursorInvalid')
    const before = cursor ? { at: Number(cursor[1]), id: cursor[2]! } : undefined

    const keys = Object.entries(schema.bricks).filter(([key, def]) => def.kind === 'collection' && !def.retired && (args.brick === undefined || args.brick === key)).map(([key]) => key)
    const rows: Doc<'entries'>[] = []
    for (const key of keys) {
      // Absent deletedAt sorts before numbers, so the lower bound keeps live entries out. Rows of one millisecond can straddle a page, so a few more are read.
      const found = await ctx.db.query('entries')
        .withIndex('by_site_brick_deleted', (q) => (before ? q.eq('site', actor.site._id).eq('brick', key).gt('deletedAt', 0).lte('deletedAt', before.at) : q.eq('site', actor.site._id).eq('brick', key).gt('deletedAt', 0)))
        .order('desc')
        .take(TRASH_PAGE + 25)
      rows.push(...found)
    }
    const newestFirst = (a: Doc<'entries'>, b: Doc<'entries'>) => b.deletedAt! - a.deletedAt! || (a._id < b._id ? 1 : a._id > b._id ? -1 : 0)
    const page = rows
      .filter((row) => !before || row.deletedAt! < before.at || (row.deletedAt === before.at && row._id < before.id))
      .sort(newestFirst)
    const shown = page.slice(0, TRASH_PAGE)
    const last = shown[shown.length - 1]

    // The badge "Removed (n)": every removed entry of the site, whatever `brick` narrows the list to.
    let total = 0
    for (const [key, def] of Object.entries(schema.bricks)) {
      if (def.kind !== 'collection' || def.retired) continue
      total += (await ctx.db.query('entries').withIndex('by_site_brick_deleted', (q) => q.eq('site', actor.site._id).eq('brick', key).gt('deletedAt', 0)).collect()).length
    }

    const items = await Promise.all(shown.map(async (row) => {
      const removal = (await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', row._id)).order('desc').take(5)).find((change) => change.kind === 'remove')
      const member = removal && removal.actor !== 'system'
        ? await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', removal.actor).eq('site', actor.site._id)).unique()
        : null
      const task = actor.role === 'staff' ? taskFor(actor, row.brick, 'remove') : undefined
      return {
        entry: row._id, brick: row.brick, brickLabel: labelIn(schema.bricks[row.brick]!.label, schema.locales[0]!, schema.locales[0]!), label: labelOf(schema, row.brick, row.data as Data),
        lifeRev: row.lifeRev, deletedAt: row.deletedAt!, purgeAt: row.deletedAt! + DELETED_KEPT, wasDraft: row.state === 'draft',
        deletedBy: removal ? { actor: removal.actor, ...(member?.email ? { email: member.email } : {}), ...(removal.via ? { via: removal.via } : {}) } : null,
        mayRestore: actor.role !== 'staff' || (task !== undefined && !directWriteRefused(actor, row.brick, task)),
        ...(task === undefined ? {} : { task }),
      }
    }))
    return { items, total, nextCursor: page.length > TRASH_PAGE && last ? `${last.deletedAt}:${last._id}` : null }
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
