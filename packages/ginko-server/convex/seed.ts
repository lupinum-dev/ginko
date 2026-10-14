// Local demo content (GINKO_LOCAL=1 only): resets one site to a corpus and invites its people.
// `scripts/seed-local.ts` passes contracts/<site>/data.json. The same file holds the import of a
// `ginko export` (SPEC 9, 12). Internal, so only `npx convex run` with the deployment's admin key
// reaches it; every function is refused on any deployment without GINKO_LOCAL, except the import steps, which a hosted
// deployment also allows into one empty site that an operator opened with `importOpen` (see importAllowed).
import type { Json } from '@lupinum/ginko'
import { validate, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import { components, internal } from './_generated/api'
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server'
import { fail } from './lib/access'
import { normalizeEmail } from './members'
import { byteSize, remapEntryRefs, remapFileIds, storageOf, usesOf, type Data } from './lib/content'
import { insertCorpus, invitePeople, type Corpus } from './lib/corpus'
import { same, syncEntryRefs } from './lib/write'

/** Validation codes for values of the wrong shape: the import refuses these (importExport). */
const UNREADABLE = new Set(['TYPE', 'NOT_OBJECT', 'NOT_LOCALIZED', 'UNKNOWN_FIELD', 'UNKNOWN_LOCALE', 'UNKNOWN_BRICK'])

function localOnly() {
  if (process.env.GINKO_LOCAL !== '1') fail('FORBIDDEN', 'errors.localOnly')
}

/**
 * The import steps run with GINKO_LOCAL=1, or on a site that is open for import (`sites.importOpen`, set by `importOpen`
 * only on an empty site). `importClear` never runs on a hosted deployment: it would delete content.
 */
async function importAllowed(ctx: QueryCtx, slug: string) {
  if (process.env.GINKO_LOCAL === '1') return true
  const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', slug)).unique()
  return site?.importOpen === true
}

async function requireImportAllowed(ctx: QueryCtx, slug: string) {
  if (!(await importAllowed(ctx, slug))) fail('FORBIDDEN', 'errors.importClosed')
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

    // Proposals point at the entries deleted here, so they go too.
    const tables = args.people ? (['entries', 'slugs', 'fileRefs', 'changes', 'ops', 'proposals', 'memberships', 'invites'] as const) : (['entries', 'slugs', 'fileRefs', 'changes', 'ops', 'proposals'] as const)
    // Fresh people also get fresh settings: a language stored by an earlier run would change every text they see.
    if (args.people) {
      for (const person of args.people) {
        const user = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: 'user', where: [{ field: 'email', value: normalizeEmail(person.email) }] })
        const id = user?.id
        const settings = typeof id === 'string' ? await ctx.db.query('userSettings').withIndex('by_user', (q) => q.eq('user', id)).unique() : null
        if (settings) await ctx.db.delete(settings._id)
      }
    }
    for (const table of tables) {
      const rows = await ctx.db.query(table).collect()
      for (const row of rows) if ((row as { site?: unknown }).site === site._id) await ctx.db.delete(row._id)
    }

    const { count } = await insertCorpus(ctx, site, args.corpus as Corpus)
    const links = await invitePeople(ctx, site, args.people ?? [], 'seed')
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

async function dropFileRefs(ctx: MutationCtx, holder: 'entry' | 'change', holderId: string) {
  const refs = await ctx.db.query('fileRefs').withIndex('by_holder', (q) => q.eq('holder', holder).eq('holderId', holderId)).collect()
  for (const ref of refs) await ctx.db.delete(ref._id)
}

/**
 * Import step 1: deletes the site's entries, slugs, file references, changes and ops, like `reset`
 * without people. One call removes a bounded part (so it stays under the limits of a mutation) and
 * returns `done: false` until nothing is left; the CLI repeats it. When done, the counters are zero
 * and contentRev has risen. Uploads and their files stay; the retention sweep removes them.
 */
export const importClear = internalMutation({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    localOnly()
    const site = await siteBySlug(ctx, args.site)
    for (const change of await ctx.db.query('changes').withIndex('by_site_at', (q) => q.eq('site', site._id)).take(500)) {
      await dropFileRefs(ctx, 'change', change._id)
      await ctx.db.delete(change._id)
    }
    for (const op of await ctx.db.query('ops').withIndex('by_site_actor_op', (q) => q.eq('site', site._id)).take(500)) await ctx.db.delete(op._id)
    for (const entry of await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id)).take(300)) {
      await dropFileRefs(ctx, 'entry', entry._id)
      for (const slug of await ctx.db.query('slugs').withIndex('by_entry', (q) => q.eq('entry', entry._id)).collect()) await ctx.db.delete(slug._id)
      await ctx.db.delete(entry._id)
    }
    for (const slug of await ctx.db.query('slugs').withIndex('by_key', (q) => q.eq('site', site._id)).take(500)) await ctx.db.delete(slug._id)

    const left = (await ctx.db.query('changes').withIndex('by_site_at', (q) => q.eq('site', site._id)).first())
      ?? (await ctx.db.query('ops').withIndex('by_site_actor_op', (q) => q.eq('site', site._id)).first())
      ?? (await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id)).first())
      ?? (await ctx.db.query('slugs').withIndex('by_key', (q) => q.eq('site', site._id)).first())
    if (left) return { done: false }
    const orderRevs = Object.fromEntries(Object.keys((site.schema as Schema).bricks).map((brick) => [brick, 0]))
    await ctx.db.patch(site._id, { bytes: 0, entryCount: 0, orderRevs, contentRev: site.contentRev + 1 })
    return { done: true }
  },
})

/**
 * Import step 2, repeated per batch: stores the batch's files as ready uploads and its entries.
 * - `files` name uploaded storage ids. A storage id that already has an upload row is not stored twice,
 *   so a repeated batch changes nothing.
 * - Entry data gets the new upload IDs in place of the exported ones (an ID that is not in `files` stays).
 * - Slugs and file references are rebuilt from the data; deletedAt, rev and prints are restored.
 * - The site's counters grow by the batch (entryCount for live entries only).
 * - The answer's `ids` map each exported entry ID to the new one; entry references in `data` still hold the exported
 *   IDs until `importRefs` rewrites them.
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
    for (const file of args.files) {
      const have = await ctx.db.query('uploads').withIndex('by_storage', (q) => q.eq('storageId', file.storageId)).first()
      uploads.set(file.id, have?._id ?? await ctx.db.insert('uploads', {
        // Exported bytes are already processed (a WebP for photos), so they are their own processed file (Astra 9).
        site: site._id, uploader: 'import', storageId: file.storageId, processedId: file.storageId, name: file.name, size: file.size, mime: file.mime,
        ...(file.width === undefined ? {} : { width: file.width }),
        ...(file.height === undefined ? {} : { height: file.height }),
        status: 'ready', attempts: 0,
        ...(file.folder !== undefined && folders.has(file.folder) ? { folder: folders.get(file.folder)! } : {}),
        ...(file.kept ? { kept: true } : {}),
        ...(file.focus ? { focus: file.focus } : {}),
        ...(file.sha256 ? { sha256: file.sha256 } : {}),
      }))
    }

    const ids: Record<string, Id<'entries'>> = {}
    const known = new Set<string>(uploads.values())
    let bytes = 0
    let live = 0
    const orderRevs: Record<string, number> = { ...site.orderRevs }
    for (const row of args.entries) {
      const def = schema.bricks[row.brick]
      if (!def) fail('INVALID', 'errors.entryBrickMissingFromSchema', { id: row.id, brick: row.brick })
      const data = remapFileIds(def.fields, row.data as Data, uploads)
      // Values the Studio and the site cannot read at all (a wrong type, an unknown field or language) are refused, so
      // an export cannot store what the editor cannot open. Rules a save enforces on top (row id format, alt texts, lengths,
      // Markdown profiles) are not: a backup must restore what the platform once stored. Entry references are not looked
      // up either; they still name exported IDs until importRefs. A deleted entry is checked when it is restored.
      if (row.deletedAt === undefined) {
        const errors = (await validate(schema, row.brick, data, { mode: 'create' })).errors.filter((e) => UNREADABLE.has(e.code))
        if (errors.length) fail('INVALID', 'errors.importEntryInvalid', { id: row.id, path: errors[0]!.path, count: errors.length }, { errors: errors as unknown as Json })
      }
      const { trees, bytes: size } = await storageOf(def.fields, data, row.prints)
      const id = await ctx.db.insert('entries', {
        site: site._id, brick: row.brick, kind: row.kind, order: row.order, data, rev: row.rev,
        fieldRevs: Object.fromEntries(Object.keys(def.fields).map((f) => [f, row.rev])),
        lifeRev: row.deletedAt === undefined ? 1 : 2, prints: row.prints, trees, bytes: size,
        ...(row.deletedAt === undefined ? {} : { deletedAt: row.deletedAt }),
        ...(row.state === 'draft' ? { state: 'draft' as const } : {}),
      })
      // A scheduled draft gets its job back (a time in the past runs at once); `contentRev` is not touched.
      if (row.state === 'draft' && row.publishAt !== undefined && row.deletedAt === undefined) {
        await ctx.db.patch(id, { publishAt: row.publishAt, publishJob: await ctx.scheduler.runAt(row.publishAt, internal.entries.publishDue, { entry: id, at: row.publishAt }) })
      }
      ids[row.id] = id
      bytes += size
      if (row.deletedAt === undefined) live++
      orderRevs[row.brick] = 1
      for (const [name, field] of Object.entries(def.fields)) {
        if (field.type !== 'slug') continue
        for (const [locale, slug] of Object.entries((data[name] ?? {}) as Record<string, string>)) {
          await ctx.db.insert('slugs', { site: site._id, brick: row.brick, locale, slug, entry: id })
        }
      }
      await syncEntryRefs(ctx, site._id, id, new Map([...usesOf(def.fields, data, schema.locales)].filter(([file]) => known.has(file))))
    }
    await ctx.db.patch(site._id, { bytes: site.bytes + bytes, entryCount: site.entryCount + live, orderRevs })
    return { entries: args.entries.length, files: args.files.length, ids }
  },
})

/**
 * Import step 2 as the CLI calls it: one batch that the CLI stored as JSON in local storage (the
 * command line is too small for entries of up to 256 KiB). Reads it, runs importExport, removes it.
 */
export const importBatch = internalAction({
  args: { site: v.string(), batch: v.id('_storage') },
  handler: async (ctx, args): Promise<{ entries: number; files: number; ids: Record<string, string> }> => {
    if (!(await ctx.runQuery(internal.seed.isImportAllowed, { site: args.site }))) fail('FORBIDDEN', 'errors.importClosed')
    const blob = await ctx.storage.get(args.batch)
    if (!blob) fail('NOT_FOUND', 'errors.importBatchNotLocal')
    const batch = JSON.parse(await blob.text()) as { site: string; files: never[]; entries: never[] }
    if (batch.site !== args.site) fail('INVALID', 'errors.importBatchOtherSite')
    const result: { entries: number; files: number; ids: Record<string, string> } = await ctx.runMutation(internal.seed.importExport, batch)
    await ctx.storage.delete(args.batch)
    return result
  },
})

/** For `importBatch`, an action without database access. */
export const isImportAllowed = internalQuery({
  args: { site: v.string() },
  handler: (ctx, args) => importAllowed(ctx, args.site),
})

/**
 * Import step 3 (after the last batch): entries got new IDs, so the entry references in `data` (`ref` fields, also in list
 * rows) still name the exported IDs. This rewrites every ID found in `ids` (exported ID → new ID); unknown IDs stay.
 * Entry references live only in `data`, so nothing else needs to follow, but the entry's `bytes` and the site's budget
 * do (the IDs differ in length). One call handles one page; the CLI repeats it with the returned `cursor` until `done`.
 */
export const importRefs = internalMutation({
  args: { site: v.string(), ids: v.record(v.string(), v.string()), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireImportAllowed(ctx, args.site)
    const site = await siteBySlug(ctx, args.site)
    const schema = site.schema as Schema
    const ids = new Map(Object.entries(args.ids))
    // 50 entries of up to 256 KiB stay under the 16 MiB a mutation may read.
    const page = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id)).paginate({ numItems: 50, cursor: args.cursor ?? null })
    let delta = 0
    let changed = 0
    for (const entry of page.page) {
      const def = schema.bricks[entry.brick]
      if (!def) continue
      const data = remapEntryRefs(def.fields, entry.data as Data, ids)
      if (same(data, entry.data)) continue
      const size = entry.bytes + byteSize(data) - byteSize(entry.data)
      await ctx.db.patch(entry._id, { data, bytes: size })
      delta += size - entry.bytes
      changed++
    }
    if (delta !== 0) await ctx.db.patch(site._id, { bytes: site.bytes + delta })
    return { done: page.isDone, cursor: page.continueCursor, changed }
  },
})

/**
 * Opens an EMPTY site for the import steps on a hosted deployment (`npx convex run --prod seed:importOpen`). Empty means
 * the state after `sites:bootstrap` and the first release: no entries (also no deleted ones), no changes, no ops.
 * `importDone` closes it again.
 */
export const importOpen = internalMutation({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const site = await siteBySlug(ctx, args.site)
    const used = (await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id)).first())
      ?? (await ctx.db.query('changes').withIndex('by_site_at', (q) => q.eq('site', site._id)).first())
      ?? (await ctx.db.query('ops').withIndex('by_site_actor_op', (q) => q.eq('site', site._id)).first())
    if (used || site.entryCount !== 0) fail('INVALID', 'errors.importNeedsEmptySite')
    await ctx.db.patch(site._id, { importOpen: true })
    return { site: args.site, open: true }
  },
})

/** Closes the import of a site and raises contentRev, so bundles and caches see the new content. */
export const importDone = internalMutation({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const site = await siteBySlug(ctx, args.site)
    await ctx.db.patch(site._id, { importOpen: undefined, ...(site.importOpen ? { contentRev: site.contentRev + 1 } : {}) })
    return { site: args.site, open: false }
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
