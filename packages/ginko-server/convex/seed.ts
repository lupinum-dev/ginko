// Local demo content (GINKO_LOCAL=1 only): resets one site to a corpus and invites its people.
// `scripts/seed-local.ts` passes contracts/<site>/data.json. The same file holds the import of a
// `ginko export` (SPEC 9, 12). Internal, so only `npx convex run` with the deployment's admin key
// reaches it; every function is refused on any deployment without GINKO_LOCAL, except the import steps, which a hosted
// deployment also allows into one empty site that an operator opened with `importOpen` (see importAllowed).
import type { Fields } from '@lupinum/ginko'
import { carryPrints, defaultsFor, entryBytes, fitsBudget, mapMarkdownTexts, remapFileIds, rewriteEntryLinks, routeUrls, stableJson, urlClashes, validate, type Msg, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import { components, internal } from './_generated/api'
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import { fail } from './lib/access'
import type { ErrorParams } from './lib/fail'
import { DEFAULT_LOCALE, t, type MessageKey } from './lib/i18n'
import { badKey } from './lib/input'
import { normalizeEmail } from './members'
import { insertSingle, newSingle } from './release'
import { remapEntryRefs, treesOf, usesOf, type Data, type Prints } from './lib/content'
import { insertCorpus, invitePeople, type Corpus } from './lib/corpus'
import { cleanName, kindOf, WRONG_TYPE } from './lib/files'
import { deleteStorage } from './lib/library'
import { dropTrees, putTrees } from './lib/trees'
import { BUDGET, same, sizeText, syncEntryRefs, uploadIdsOf } from './lib/write'

function localOnly() {
  if (process.env.GINKO_LOCAL !== '1') fail('FORBIDDEN', 'errors.localOnly')
}

/**
 * Clearing a site's content: a local backend, or the demo platform (GINKO_DEMO=1), whose template sites are reset from
 * git every week. The client platform never sets GINKO_DEMO, so no key or command can clear a client's site there.
 */
function localOrDemoOnly() {
  if (process.env.GINKO_LOCAL !== '1' && process.env.GINKO_DEMO !== '1') fail('FORBIDDEN', 'errors.localOrDemoOnly')
}

/**
 * The import steps run with GINKO_LOCAL=1, or on a site that is open for import (`sites.importOpen`, set by `importOpen`
 * only on an empty site). `importClear` runs on a hosted deployment only with GINKO_DEMO=1 (localOrDemoOnly).
 */
async function importAllowed(ctx: QueryCtx, slug: string) {
  if (process.env.GINKO_LOCAL === '1') return true
  const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', slug)).unique()
  return site?.importOpen === true
}

async function requireImportAllowed(ctx: QueryCtx, slug: string) {
  if (!(await importAllowed(ctx, slug))) fail('FORBIDDEN', 'errors.importClosed')
}

/**
 * Empties Better Auth's rate-limit buckets. The local backend sees no client IP, so all requests share one bucket per
 * path, and a bucket only empties after 10 s without a request: an e2e run that never pauses that long got 429 on its
 * 301st token request and was sent to the sign-in. A reset starts the next test with empty buckets. Local only.
 */
async function dropRateLimits(ctx: MutationCtx) {
  const page = await ctx.runQuery(components.betterAuth.adapter.findMany, { model: 'rateLimit', select: ['id'], paginationOpts: { cursor: null, numItems: 100 } })
  const ids = page.page.map((row) => String(row.id))
  // By id, like cleanup.ts: `deleteMany` touches at most 128 rows at once.
  if (ids.length) await ctx.runMutation(components.betterAuth.adapter.deleteMany, { model: 'rateLimit', where: [{ field: 'id', operator: 'in', value: ids }] })
}

export const reset = internalMutation({
  args: {
    site: v.string(),
    corpus: v.any(),
    /** Without people, only the content is reset; members and invites stay (e2e tests between runs). */
    people: v.optional(v.array(v.object({ email: v.string(), role: v.union(v.literal('owner'), v.literal('staff')), grants: v.array(v.string()) }))),
  },
  handler: async (ctx, args) => {
    localOnly()
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.site)).unique()
    if (!site) fail('SITE_NOT_FOUND', 'errors.siteNotStartedDev')
    const schema = site.schema as Schema

    // Proposals point at the entries deleted here, so they go too; members and invites only when fresh people come.
    // Fresh people also get fresh settings: a language stored by an earlier run would change every text they see.
    if (args.people) {
      for (const person of args.people) {
        const user = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: 'user', where: [{ field: 'email', value: normalizeEmail(person.email) }] })
        const id = user?.id
        const settings = typeof id === 'string' ? await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', id)).unique() : null
        if (settings) await ctx.db.delete(settings._id)
      }
    }
    // Each table through an index that starts with the site, so the reset reads only this site's rows: a full scan
    // would also read other sites and conflict with any write to them (an import running at the same time).
    const id = site._id
    const rows = [
      ...(await ctx.db.query('entries').withIndex('by_site_deleted', (q) => q.eq('site', id)).collect()),
      ...(await ctx.db.query('entryTrees').withIndex('by_site', (q) => q.eq('site', id)).collect()),
      ...(await ctx.db.query('pendingChanges').withIndex('by_site', (q) => q.eq('site', id)).collect()),
      ...(await ctx.db.query('slugs').withIndex('by_key', (q) => q.eq('site', id)).collect()),
      ...(await ctx.db.query('fileRefs').withIndex('by_site_holder', (q) => q.eq('site', id)).collect()),
      ...(await ctx.db.query('changes').withIndex('by_site_at', (q) => q.eq('site', id)).collect()),
      ...(await ctx.db.query('ops').withIndex('by_site_actor_op', (q) => q.eq('site', id)).collect()),
      ...(await ctx.db.query('proposals').withIndex('by_site', (q) => q.eq('site', id)).collect()),
      ...(args.people ? await ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', id)).collect() : []),
      ...(args.people ? await ctx.db.query('invites').withIndex('by_site', (q) => q.eq('site', id)).collect() : []),
    ]
    for (const row of rows) await ctx.db.delete(row._id)

    const { count } = await insertCorpus(ctx, site, args.corpus as Corpus)
    const links = await invitePeople(ctx, site, args.people ?? [], 'seed')
    await dropRateLimits(ctx)
    return { entries: count, links }
  },
})

// ---- Import of a `ginko export` (SPEC 9, 12). The CLI calls these in steps because `convex run`
// takes its arguments on the command line and one mutation has document limits. ----

/** An upload URL of the local storage; the CLI posts one exported file to it and gets a storage id. */
export const uploadUrl = internalMutation({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    await requireImportAllowed(ctx, args.site)
    return ctx.storage.generateUploadUrl()
  },
})

async function siteBySlug(ctx: MutationCtx, slug: string) {
  const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', slug)).unique()
  if (!site) fail('SITE_NOT_FOUND', 'errors.siteNotPushedSchema')
  return site
}

/** What one importClear call may read before it stops: a quarter of a mutation's 16 MiB, leaving room for its writes. */
const CLEAR_BYTES = 4_000_000
const CLEAR_DOCS = 2000

/**
 * Import step 1: deletes the site's entries, trees, slugs, file references, changes and ops, like `reset` without
 * people. One call stops after about CLEAR_BYTES of documents (or CLEAR_DOCS of them), so it stays under the limits of a
 * mutation whatever the size of the rows, and returns `done: false` until nothing is left; the CLI repeats it, and a
 * rerun after a failure continues where the last call stopped. When done, the counters are zero and contentRev has
 * risen. Uploads and their files stay; the retention sweep removes them.
 */
export const importClear = internalMutation({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    localOrDemoOnly()
    const site = await siteBySlug(ctx, args.site)
    let spent = 0
    let docs = 0
    const full = () => spent > CLEAR_BYTES || docs >= CLEAR_DOCS
    const drop = async (doc: { _id: Id<TableNames> }) => {
      spent += JSON.stringify(doc).length
      docs++
      await ctx.db.delete(doc._id)
    }
    const dropRefs = async (holder: Doc<'fileRefs'>['holder'], holderId: string) => {
      for (const ref of await ctx.db.query('fileRefs').withIndex('by_holder', (q) => q.eq('holder', holder).eq('holderId', holderId)).collect()) await drop(ref)
    }

    for await (const change of ctx.db.query('changes').withIndex('by_site_at', (q) => q.eq('site', site._id))) {
      if (full()) return { done: false }
      await dropRefs('change', change._id)
      await drop(change)
    }
    for await (const op of ctx.db.query('ops').withIndex('by_site_actor_op', (q) => q.eq('site', site._id))) {
      if (full()) return { done: false }
      await drop(op)
    }
    // The trees first, by site: an entry's parts can be larger than the entry.
    for await (const part of ctx.db.query('entryTrees').withIndex('by_site', (q) => q.eq('site', site._id))) {
      if (full()) return { done: false }
      await drop(part)
    }
    for await (const row of ctx.db.query('pendingChanges').withIndex('by_site', (q) => q.eq('site', site._id))) {
      if (full()) return { done: false }
      await dropRefs('pending', row.entry)
      await drop(row)
    }
    for await (const entry of ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id))) {
      if (full()) return { done: false }
      await dropRefs('entry', entry._id)
      for (const slug of await ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', entry._id)).collect()) await drop(slug)
      await drop(entry)
    }
    for await (const slug of ctx.db.query('slugs').withIndex('by_key', (q) => q.eq('site', site._id))) {
      if (full()) return { done: false }
      await drop(slug)
    }

    await ctx.db.patch(site._id, { bytes: 0, trashBytes: 0, treeBytes: 0, entryCount: 0, contentRev: site.contentRev + 1 })
    return { done: true }
  },
})

/** One reason an import batch is refused; the batch answers with all of them (details.problems), the first as its error. */
type ImportProblem = { code: 'INVALID' | 'TOO_LARGE'; key: MessageKey; params: ErrorParams }

/** The first value of an import batch that the Studio would refuse today: the exported entry ID, its brick and the issue. */
export type ImportWarning = { id: string; brick: string; path: string } & Msg

/**
 * Import step 2, repeated per batch: stores the batch's files as ready uploads and its entries.
 * - `files` name uploaded storage ids. A storage id that already has an upload row is not stored twice,
 *   so a repeated batch changes nothing.
 * - Entry data gets the new upload IDs in place of the exported ones (an ID that is not in `files` stays).
 * - Slugs and file references are rebuilt from the data; deletedAt, rev and prints are restored.
 * - The site's counters grow by the batch (entryCount for live entries only).
 * - `warnings` counts the entries that hold values the Studio would refuse today (they are stored as they are);
 *   `firstWarning` names the first one.
 * - The answer's `ids` pair each exported entry ID with the new one, as a list: Convex refuses an object with more than
 *   1024 fields. Entry references in `data` still hold the exported IDs until `importRefs` rewrites them.
 */
export const importExport = internalMutation({
  args: {
    site: v.string(),
    files: v.array(v.object({
      /** The upload ID in the export. */
      id: v.string(),
      storageId: v.id('_storage'),
      name: v.string(),
      mime: v.string(),
      size: v.number(),
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      /** Library fields of a backup (SPEC 12): the folder's ID in the export, kept, focus, hash. */
      folder: v.optional(v.string()),
      kept: v.optional(v.boolean()),
      focus: v.optional(v.object({ x: v.number(), y: v.number() })),
      sha256: v.optional(v.string()),
      /** The original file (`local:files-export`), not a processed copy from a backup: it goes through the upload pipeline. */
      original: v.optional(v.boolean()),
      /** The Files library description per language. */
      alt: v.optional(v.record(v.string(), v.string())),
    })),
    /** The folders of the export, parents first or in any order. */
    folders: v.optional(v.array(v.object({ id: v.string(), name: v.string(), parent: v.optional(v.string()) }))),
    entries: v.array(v.object({
      id: v.string(),
      brick: v.string(),
      kind: v.union(v.literal('single'), v.literal('item')),
      order: v.number(),
      data: v.any(),
      prints: v.record(v.string(), v.record(v.string(), v.string())),
      rev: v.number(),
      deletedAt: v.optional(v.number()),
      state: v.optional(v.union(v.literal('draft'), v.literal('live'))),
      publishAt: v.optional(v.number()),
      /** When the entry last changed for the public (the bundle's updatedAt); absent in older exports, then the import time. */
      contentAt: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    await requireImportAllowed(ctx, args.site)
    const site = await siteBySlug(ctx, args.site)
    const schema = site.schema as Schema

    // Folders are matched by name and parent, so a repeated batch does not make them twice.
    const folders = new Map<string, Id<'folders'>>()
    const pending = [...(args.folders ?? [])]
    while (pending.length) {
      const before = pending.length
      for (const folder of [...pending]) {
        if (folder.parent !== undefined && !folders.has(folder.parent)) continue
        const parent = folder.parent === undefined ? undefined : folders.get(folder.parent)
        const siblings = await ctx.db.query('folders').withIndex('by_site_parent', (q) => q.eq('site', site._id).eq('parent', parent)).collect()
        const have = siblings.find((f) => f.name === folder.name)
        folders.set(folder.id, have?._id ?? await ctx.db.insert('folders', { site: site._id, name: folder.name, ...(parent ? { parent } : {}) }))
        pending.splice(pending.indexOf(folder), 1)
      }
      if (pending.length === before) fail('INVALID', 'errors.backupFoldersInconsistent')
    }

    const uploads = new Map<string, Id<'uploads'>>()
    // A backup carries no smaller copies (variants): restored images get them made afterwards.
    let withoutVariants = false
    // Originals that go (or already went) through the upload pipeline: the CLI waits for these (importUploads).
    const originals: Id<'uploads'>[] = []
    for (const file of args.files) {
      // A repeated batch names the same stored file: it is stored once.
      const have = await ctx.db.query('uploads').withIndex('by_storage', (q) => q.eq('storageId', file.storageId)).first()
      if (have) {
        uploads.set(file.id, have._id)
        if (file.original) originals.push(have._id)
        continue
      }
      const sha256 = file.sha256
      const library = {
        ...(file.folder !== undefined && folders.has(file.folder) ? { folder: folders.get(file.folder)! } : {}),
        ...(file.kept ? { kept: true } : {}),
        ...(file.focus ? { focus: file.focus } : {}),
        ...(sha256 ? { sha256 } : {}),
        ...(file.alt && Object.keys(file.alt).length ? { alt: file.alt } : {}),
      }
      // The same content is already in this site's library (an earlier import, or the owner's own upload): the entries
      // use that file, with its description, and the copy the CLI stored again is not kept. An original from
      // files-export takes any such file (the export holds each content once). A backup may hold the same content as two
      // library files with their own description, folder, focus or kept flag: it takes only a file that has the same.
      const candidates = sha256 === undefined ? [] : await ctx.db.query('uploads').withIndex('by_site_sha256', (q) => q.eq('site', site._id).eq('sha256', sha256))
        .filter((q) => q.and(q.eq(q.field('trashedAt'), undefined), q.neq(q.field('status'), 'failed'))).collect()
      const libraryOf = (row: { folder?: Id<'folders'>; kept?: boolean; focus?: { x: number; y: number }; alt?: Record<string, string> }) =>
        stableJson([row.folder ?? null, row.kept ?? false, row.focus ?? null, row.alt ?? {}])
      const same = candidates.find((row) => file.original || libraryOf(row) === libraryOf(library))
      if (same) {
        uploads.set(file.id, same._id)
        if (file.original) originals.push(same._id)
        await deleteStorage(ctx, file.storageId)
        continue
      }
      if (file.original) {
        // An original takes the path of every upload (uploadsNode): content check, metadata removed, WebP, size limit, variants.
        if (!kindOf(file.mime)) fail('INVALID', WRONG_TYPE.key, WRONG_TYPE.params)
        const id = await ctx.db.insert('uploads', { site: site._id, uploader: 'import', storageId: file.storageId, name: cleanName(file.name), size: file.size, mime: file.mime, status: 'processing', attempts: 0, ...library })
        await ctx.scheduler.runAfter(0, internal.uploadsNode.run, { upload: id })
        uploads.set(file.id, id)
        originals.push(id)
        continue
      }
      uploads.set(file.id, await ctx.db.insert('uploads', {
        // Exported bytes are already processed (a WebP for photos), so they are their own processed file (Astra 9).
        site: site._id, uploader: 'import', storageId: file.storageId, processedId: file.storageId, name: file.name, size: file.size, mime: file.mime,
        ...(file.width === undefined ? {} : { width: file.width }),
        ...(file.height === undefined ? {} : { height: file.height }),
        status: 'ready', attempts: 0, ...library,
      }))
      if (file.mime.startsWith('image/')) withoutVariants = true
    }

    // 1. Check every row before anything is stored, and collect every problem, so the operator fixes them in one pass.
    // Values the Studio and the site cannot read at all (a wrong type, an unknown field or language) are refused, so
    // an export cannot store what the editor cannot open. Rules a save enforces on top (row id format, alt texts, lengths,
    // Markdown profiles) are not: a backup must restore what the platform once stored, so they come back as warnings.
    // Entry references are not looked up; they still name exported IDs until importRefs. Removed entries are checked
    // too: a restore checks nothing, so this is the only check they get. The budget is checked like a save: each entry,
    // removed ones too (a restore must be able to save them), the live entries against the site, the removed ones
    // against the trash.
    const problems: ImportProblem[] = []
    const rows: { row: (typeof args.entries)[number]; fields: Fields; data: Data; prints: Prints; size: number; trees: { json: string; bytes: number } }[] = []
    let bytes = 0
    let trashBytes = 0
    let treeBytes = 0
    let live = 0
    // Entries with values the Studio would refuse today, and the first such value (for the CLI's one-line notice).
    let warnings = 0
    let firstWarning: ImportWarning | undefined
    for (const row of args.entries) {
      const def = Object.hasOwn(schema.bricks, row.brick) ? schema.bricks[row.brick] : undefined
      if (!def) {
        problems.push({ code: 'INVALID', key: 'errors.entryBrickMissingFromSchema', params: { id: row.id, brick: row.brick } })
        continue
      }
      const data = remapFileIds(def.fields, row.data as Data, uploads)
      // New file IDs change the main-language text a translation was made from, not its meaning.
      const prints = carryPrints(def.fields, row.data as Data, data, row.prints, schema.locales[0]!)
      const checked = await validate(schema, row.brick, data, { mode: 'restore' })
      if (checked.errors.length) problems.push({ code: 'INVALID', key: 'errors.importEntryInvalid', params: { id: row.id, path: checked.errors[0]!.path, count: checked.errors.length } })
      const warning = checked.warnings[0]
      if (warning) {
        warnings++
        firstWarning ??= { id: row.id, brick: row.brick, path: warning.path, key: warning.key, ...(warning.params ? { params: warning.params } : {}) }
      }
      const size = entryBytes(data, prints)
      if (size > BUDGET.entryBytes) problems.push({ code: 'TOO_LARGE', key: 'errors.importEntryTooLarge', params: { id: row.id, used: sizeText(size), limit: sizeText(BUDGET.entryBytes) } })
      // The trash keeps no trees.
      const trees = row.deletedAt === undefined ? await treesOf(def.fields, data) : { json: '', bytes: 0 }
      if (row.deletedAt === undefined) {
        live++
        bytes += size
        treeBytes += trees.bytes
      } else trashBytes += size
      rows.push({ row, fields: def.fields, data, prints, size, trees })
    }
    // What the Studio keeps true: every entry once, a collection within its max, one entry per address. An export that
    // breaks it gives two pages one URL, or a collection whose removed entries cannot come back. The CLI checks the
    // whole export before it clears anything (checkImport); here a batch is checked in itself, and the max with the
    // entries stored before it.
    const seen = new Set<string>()
    for (const { row } of rows) {
      if (seen.has(row.id)) problems.push({ code: 'INVALID', key: 'errors.importDuplicateId', params: { id: row.id } })
      seen.add(row.id)
    }
    const added = new Map<string, number>()
    for (const { row } of rows) if (row.deletedAt === undefined) added.set(row.brick, (added.get(row.brick) ?? 0) + 1)
    for (const [brick, count] of added) {
      const def = schema.bricks[brick]!
      if (def.kind !== 'collection') continue
      const stored = await ctx.db.query('entries').withIndex('by_site_brick_deleted', (q) => q.eq('site', site._id).eq('brick', brick).eq('deletedAt', undefined)).collect()
      if (stored.length + count > def.max) problems.push({ code: 'INVALID', key: 'errors.importCollectionTooFull', params: { brick, count: stored.length + count, max: def.max } })
    }
    const addresses = rows.flatMap(({ row, data }) => {
      const def = schema.bricks[row.brick]!
      return def.kind === 'collection' ? [{ id: row.id, urls: routeUrls(schema, def, { id: row.id, order: row.order, data }) }] : []
    })
    for (const clash of urlClashes(addresses)) problems.push({ code: 'INVALID', key: 'errors.importSameUrl', params: { a: clash.first, b: clash.second, url: clash.url } })
    if (site.entryCount + live > BUDGET.entries) problems.push({ code: 'TOO_LARGE', key: 'errors.siteEntryLimitReached', params: {} })
    if (site.bytes + bytes > BUDGET.siteBytes) problems.push({ code: 'TOO_LARGE', key: 'errors.importSiteTooLarge', params: { used: sizeText(site.bytes + bytes), limit: sizeText(BUDGET.siteBytes) } })
    const trashAfter = (site.trashBytes ?? 0) + trashBytes
    if (trashAfter > BUDGET.trashBytes) problems.push({ code: 'TOO_LARGE', key: 'errors.importTrashTooLarge', params: { used: sizeText(trashAfter), limit: sizeText(BUDGET.trashBytes) } })
    // The bundle reads every live entry's trees: past the hidden guard, every public page would fail.
    if ((site.treeBytes ?? 0) + treeBytes > BUDGET.treeBytes) problems.push({ code: 'TOO_LARGE', key: 'errors.entryTooComplex', params: {} })
    const first = problems[0]
    if (first) fail(first.code, first.key, first.params, { problems: problems.map((p) => ({ ...p, message: t(DEFAULT_LOCALE, p.key, p.params) })) })

    // 2. Store.
    const ids: [string, Id<'entries'>][] = []
    const known = new Set<string>(uploads.values())
    for (const { row, fields, data, prints, size, trees } of rows) {
      const id = await ctx.db.insert('entries', {
        site: site._id, brick: row.brick, kind: row.kind, order: row.order, data, rev: row.rev,
        fieldRevs: Object.fromEntries(Object.keys(fields).map((f) => [f, row.rev])),
        lifeRev: row.deletedAt === undefined ? 1 : 2, prints, bytes: size, treeBytes: trees.bytes, contentAt: row.contentAt ?? Date.now(),
        ...(row.deletedAt === undefined ? {} : { deletedAt: row.deletedAt }),
        ...(row.state === 'draft' ? { state: 'draft' as const } : {}),
      })
      await putTrees(ctx, site._id, id, trees.json)
      // A scheduled draft gets its job back (a time in the past runs at once); `contentRev` is not touched.
      if (row.state === 'draft' && row.publishAt !== undefined && row.deletedAt === undefined) {
        await ctx.db.patch(id, { publishAt: row.publishAt, publishJob: await ctx.scheduler.runAt(row.publishAt, internal.entries.publishDue, { entry: id, at: row.publishAt }) })
      }
      ids.push([row.id, id])
      for (const [name, field] of Object.entries(fields)) {
        if (field.type !== 'slug') continue
        for (const [locale, slug] of Object.entries((data[name] ?? {}) as Record<string, string>)) {
          await ctx.db.insert('slugs', { site: site._id, brick: row.brick, locale, slug, entry: id })
        }
      }
      await syncEntryRefs(ctx, site._id, id, new Map([...usesOf(fields, data, schema.locales, uploadIdsOf(ctx))].filter(([file]) => known.has(file))))
    }
    // It only touches ready images without variants, so a second run (next batch) changes nothing.
    if (withoutVariants) await ctx.scheduler.runAfter(0, internal.images.backfillVariants, {})
    await ctx.db.patch(site._id, {
      bytes: site.bytes + bytes, trashBytes: trashAfter, treeBytes: (site.treeBytes ?? 0) + treeBytes, entryCount: site.entryCount + live,
    })
    return { entries: args.entries.length, files: args.files.length, ids, uploads: originals, warnings, ...(firstWarning ? { firstWarning } : {}) }
  },
})

/**
 * Import step 2 as the CLI calls it: one batch that the CLI stored as JSON in local storage (the
 * command line is too small for entries of up to 480 KiB). Reads it, runs importExport, removes it.
 */
export const importBatch = internalAction({
  args: { site: v.string(), batch: v.id('_storage') },
  handler: async (ctx, args): Promise<ImportAnswer> => {
    if (!(await ctx.runQuery(internal.seed.isImportAllowed, { site: args.site }))) fail('FORBIDDEN', 'errors.importClosed')
    const blob = await ctx.storage.get(args.batch)
    if (!blob) fail('NOT_FOUND', 'errors.importBatchNotLocal')
    const batch = JSON.parse(await blob.text()) as { site: string; files: never[]; entries: never[] }
    if (batch.site !== args.site) fail('INVALID', 'errors.importBatchOtherSite')
    // runMutation would refuse such a key with an uncoded error; name it instead.
    const bad = badKey(batch)
    if (bad) fail('INVALID', 'errors.nameNotAllowed', { name: bad })
    const result: ImportAnswer = await ctx.runMutation(internal.seed.importExport, batch)
    await ctx.storage.delete(args.batch)
    return result
  },
})

/** What one import batch answers (importExport, importBatch). */
type ImportAnswer = { entries: number; files: number; ids: [string, string][]; uploads: Id<'uploads'>[]; warnings: number; firstWarning?: ImportWarning }

/** For `importBatch`, an action without database access. */
export const isImportAllowed = internalQuery({
  args: { site: v.string() },
  handler: (ctx, args) => importAllowed(ctx, args.site),
})

/**
 * Import step 3 (after the last batch): entries got new IDs, so the entry references in `data` (`ref` fields, also in list
 * rows, and links in Markdown texts, `[Anna]($authors.<id>)`) still name the exported IDs. This rewrites every ID found in
 * `ids` (exported ID → new ID); unknown IDs and slugs stay. `ids` is a list of pairs, not an object: Convex refuses an
 * object with more than 1024 fields. The entry's `bytes` and the site's budget follow (the IDs differ in length); a text
 * with a rewritten link also gets its trees parsed again (the bundle serves those) and keeps a translation current that
 * was current before. One call handles one page and names the entries it changed; the CLI repeats it with the returned
 * `cursor` until `done`, and once per part of the pairs when they do not fit one call.
 */
export const importRefs = internalMutation({
  args: { site: v.string(), ids: v.array(v.object({ from: v.string(), to: v.string() })), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireImportAllowed(ctx, args.site)
    const site = await siteBySlug(ctx, args.site)
    const schema = site.schema as Schema
    const ids = new Map(args.ids.map(({ from, to }) => [from, to]))
    const exportedOf = new Map(args.ids.map(({ from, to }) => [to, from]))
    // 25 entries of up to 480 KiB stay under the 16 MiB a mutation may read.
    const page = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id)).paginate({ numItems: 25, cursor: args.cursor ?? null })
    let delta = 0
    let trashDelta = 0
    let treeDelta = 0
    const changed: Id<'entries'>[] = []
    for (const entry of page.page) {
      const def = schema.bricks[entry.brick]
      if (!def) continue
      const refs = remapEntryRefs(def.fields, entry.data as Data, ids)
      const data = mapMarkdownTexts(def.fields, refs, (text) => rewriteEntryLinks(text, ids)) as Data
      if (same(data, entry.data)) continue
      // New IDs in a link change the main-language text a translation was made from, not its meaning.
      const texts = !same(data, refs)
      const prints = texts ? carryPrints(def.fields, entry.data as Data, data, entry.prints as Prints, schema.locales[0]!) : entry.prints
      const size = entry.bytes + entryBytes(data, prints) - entryBytes(entry.data, entry.prints)
      // A path ID from `ginko files-export` is shorter than a Convex ID: an entry with many references grows here. The CLI
      // checks this before it clears anything (checkImport); this is the platform's own guard.
      if (!fitsBudget(size, entry.bytes, BUDGET.entryBytes)) {
        fail('TOO_LARGE', 'errors.importEntryTooLarge', { id: exportedOf.get(entry._id) ?? entry._id, used: sizeText(size), limit: sizeText(BUDGET.entryBytes) })
      }
      // The trash keeps no trees.
      const trees = texts && entry.deletedAt === undefined ? await treesOf(def.fields, data) : undefined
      await ctx.db.patch(entry._id, { data, prints, bytes: size, ...(trees ? { treeBytes: trees.bytes } : {}) })
      if (trees) {
        await putTrees(ctx, site._id, entry._id, trees.json)
        treeDelta += trees.bytes - (entry.treeBytes ?? 0)
      }
      if (entry.deletedAt === undefined) delta += size - entry.bytes
      else trashDelta += size - entry.bytes
      changed.push(entry._id)
    }
    const bytes = site.bytes + delta
    const trashBytes = (site.trashBytes ?? 0) + trashDelta
    const treeBytes = (site.treeBytes ?? 0) + treeDelta
    if (!fitsBudget(bytes, site.bytes, BUDGET.siteBytes)) fail('TOO_LARGE', 'errors.importSiteTooLarge', { used: sizeText(bytes), limit: sizeText(BUDGET.siteBytes) })
    if (!fitsBudget(trashBytes, site.trashBytes ?? 0, BUDGET.trashBytes)) fail('TOO_LARGE', 'errors.importTrashTooLarge', { used: sizeText(trashBytes), limit: sizeText(BUDGET.trashBytes) })
    // The bundle reads every live entry's trees: past the guard, every public page would fail.
    if (!fitsBudget(treeBytes, site.treeBytes ?? 0, BUDGET.treeBytes)) fail('TOO_LARGE', 'errors.entryTooComplex')
    if (delta !== 0 || trashDelta !== 0 || treeDelta !== 0) await ctx.db.patch(site._id, { bytes, trashBytes, treeBytes })
    return { done: page.isDone, cursor: page.continueCursor, changed }
  },
})

/**
 * Opens an EMPTY site for the import steps on a hosted deployment (`npx convex run --prod seed:importOpen`). Empty means
 * the state after `sites:bootstrap` and the first release: no changes but the release's own, no ops, and no entries
 * except the singles that release created from their defaults (release.ts newSingle) and nobody has touched. Those are
 * removed here, so the export's singles take their place; `importDone` creates again any single the export did not
 * bring, and closes the site.
 */
export const importOpen = internalMutation({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const site = await siteBySlug(ctx, args.site)
    const schema = site.schema as Schema
    // A release records itself in the history (kind 'release'); that is not content.
    const used = (await ctx.db.query('changes').withIndex('by_site_at', (q) => q.eq('site', site._id)).filter((q) => q.neq(q.field('kind'), 'release')).first())
      ?? (await ctx.db.query('ops').withIndex('by_site_actor_op', (q) => q.eq('site', site._id)).first())
    const entries = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id)).collect()
    const untouched = (e: Doc<'entries'>) => {
      const def = Object.hasOwn(schema.bricks, e.brick) ? schema.bricks[e.brick] : undefined
      return def?.kind === 'single' && e.kind === 'single' && e.rev === 1 && e.deletedAt === undefined && e.state === undefined
        && stableJson(e.data) === stableJson(defaultsFor(def.fields))
    }
    if (used || !entries.every(untouched) || site.entryCount !== entries.length) fail('INVALID', 'errors.importNeedsEmptySite')
    let bytes = 0
    let treeBytes = 0
    for (const entry of entries) {
      await syncEntryRefs(ctx, site._id, entry._id, new Map())
      await dropTrees(ctx, entry._id)
      await ctx.db.delete(entry._id)
      bytes += entry.bytes
      treeBytes += entry.treeBytes ?? 0
    }
    await ctx.db.patch(site._id, {
      importOpen: true,
      ...(entries.length ? { entryCount: 0, bytes: site.bytes - bytes, treeBytes: (site.treeBytes ?? 0) - treeBytes } : {}),
    })
    return { site: args.site, open: true }
  },
})

/**
 * Closes the import of a site and raises contentRev, so bundles and caches see the new content. A single brick without
 * an entry gets one from its defaults, as a release makes it: the export may lack one that importOpen removed.
 */
export const importDone = internalMutation({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const site = await siteBySlug(ctx, args.site)
    if (site.importOpen) {
      const schema = site.schema as Schema
      const created = []
      for (const [brick, def] of Object.entries(schema.bricks)) {
        if (def.kind !== 'single') continue
        const have = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id).eq('brick', brick)).first()
        if (have) continue
        const single = await newSingle(brick, def.fields, schema.locales[0]!)
        await insertSingle(ctx, site._id, single, schema.locales)
        created.push(single)
      }
      if (created.length) {
        await ctx.db.patch(site._id, {
          entryCount: site.entryCount + created.length,
          bytes: site.bytes + created.reduce((sum, c) => sum + c.bytes, 0),
          treeBytes: (site.treeBytes ?? 0) + created.reduce((sum, c) => sum + c.trees.bytes, 0),
        })
      }
    }
    await ctx.db.patch(site._id, { importOpen: undefined, ...(site.importOpen ? { contentRev: site.contentRev + 1 } : {}) })
    return { site: args.site, open: false }
  },
})

/**
 * How far the processing of imported originals is (the IDs importExport answered): counts per status and the name and
 * reason of each failed file. Ids of another site are ignored. Internal like the rest of the import, so the CLI polls it
 * with the same access (`convex run`).
 */
export const importUploads = internalQuery({
  args: { site: v.string(), ids: v.array(v.id('uploads')) },
  handler: async (ctx, args) => {
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.site)).unique()
    const count = { processing: 0, ready: 0, failed: 0 }
    const failedFiles: { name: string; error: string }[] = []
    if (!site) return { ...count, failedFiles }
    for (const id of args.ids) {
      const row = await ctx.db.get(id)
      if (!row || row.site !== site._id) continue
      count[row.status]++
      if (row.status === 'failed') failedFiles.push({ name: row.name, error: row.error ?? 'errors.uploadFailed' })
    }
    return { ...count, failedFiles }
  },
})

/** What `pnpm ops:import` checks before it opens a hosted site: the bricks of the stored (released) schema, or null for an unknown site. */
export const importStatus = internalQuery({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.site)).unique()
    return site ? { bricks: Object.keys((site.schema as Schema).bricks) } : null
  },
})
