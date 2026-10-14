// The asset library, backend (SPEC 3, 4.3, 12): folders, the views of the "Finder" (all, recent,
// unused, missing alt text, duplicates, trash), "used in", rename, move, focus, keep, trash, restore
// and replace. Everything is scoped to one site; an id of another site is NOT_FOUND, never a hint.
// Rights: all members read and upload; everything that changes the library is for owner and admin.
// Library actions write no `changes` rows (those are the content history, SPEC 3).
import type { Json, Label } from '@lupinum/ginko'
import { ALT_MAX, effectiveAlt, type Schema } from '@lupinum/ginko/internal'
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, mutation, query, type QueryCtx } from './_generated/server'
import { labeler } from './lib/names'
import { labelOf } from './entries'
import { actorFor, fail, type Actor } from './lib/access'
import { fieldLabelAt, usesOf, valueAt, type Data } from './lib/content'
import { cleanName } from './lib/files'
import { entryUses, same, uploadIdsOf } from './lib/write'

const PAGE = 50
/** Rows read per step and steps per call: a view that filters a lot returns early with a cursor instead of reading the whole table. */
const SCAN = 100
const MAX_SCANS = 5
/** References the sidebar count reads at most. */
const COUNT_MAX = 1000
/** Files or ids one call may touch. */
const MAX_IDS = 200
const FOLDER_NAME_MAX = 80

const ids = v.array(v.string())

// ---- Access helpers ----

/** Owner and admin may change the library; staff only reads and uploads. */
async function manager(ctx: QueryCtx, site: string): Promise<Actor> {
  const actor = await actorFor(ctx, site)
  if (actor.role === 'staff') fail('FORBIDDEN', 'errors.fileLibraryOwnersOnly')
  return actor
}

async function uploadOf(ctx: QueryCtx, actor: Actor, id: string): Promise<Doc<'uploads'>> {
  const normalized = ctx.db.normalizeId('uploads', id)
  const row = normalized ? await ctx.db.get(normalized) : null
  if (!row || row.site !== actor.site._id) fail('NOT_FOUND', 'errors.fileNotFound')
  return row
}

async function uploadsOf(ctx: QueryCtx, actor: Actor, list: string[]): Promise<Doc<'uploads'>[]> {
  if (list.length > MAX_IDS) fail('INVALID', 'errors.tooManyFiles')
  const out: Doc<'uploads'>[] = []
  for (const id of new Set(list)) out.push(await uploadOf(ctx, actor, id))
  return out
}

async function folderOf(ctx: QueryCtx, actor: Actor, id: string): Promise<Doc<'folders'>> {
  const normalized = ctx.db.normalizeId('folders', id)
  const row = normalized ? await ctx.db.get(normalized) : null
  if (!row || row.site !== actor.site._id) fail('NOT_FOUND', 'errors.folderNotFound')
  return row
}

const kindOfUpload = (row: Doc<'uploads'>) => (row.mime.startsWith('image/') ? 'image' : 'pdf')

// ---- Uses ----

/** Entries (deleted ones too) whose file references name this file. */
async function entryRefsOf(ctx: QueryCtx, file: Id<'uploads'>) {
  const refs = await ctx.db.query('fileRefs').withIndex('by_file', (q) => q.eq('file', file)).collect()
  return refs.filter((r) => r.holder === 'entry')
}

async function usedInOf(ctx: QueryCtx, schema: Schema, refs: Doc<'fileRefs'>[], library?: Record<string, string>) {
  const out: { entry: string; brick: string; title: string; paths: string[]; fieldLabels: (Label | null)[]; locale: string | null; missingAlt: boolean; deleted: boolean }[] = []
  for (const ref of refs) {
    const id = ctx.db.normalizeId('entries', ref.holderId)
    const entry = id ? await ctx.db.get(id) : null
    if (!entry) continue
    const uses = ref.uses ?? []
    // Images carry one file for all languages; what differs per language is the description. `locale` is the first language of the site
    // that still lacks it in this entry (null when none does), so "Used in" can say where the work is.
    const lacking = uses.filter((u) => u.missingAlt).map((u) => valueAt(entry.data as Data, u.path) as { alt?: Record<string, Json> } | undefined)
    const locale = ref.missingAlt === true
      ? schema.locales.find((l) => lacking.some((value) => !effectiveAlt(value?.alt, library, l))) ?? null
      : null
    out.push({
      entry: entry._id, brick: entry.brick, title: labelOf(schema, entry.brick, entry.data as Data),
      paths: uses.map((u) => u.path), fieldLabels: uses.map((u) => fieldLabelAt(schema, entry.brick, u.path)), locale,
      missingAlt: ref.missingAlt === true, deleted: entry.deletedAt !== undefined,
    })
  }
  return out
}

/** How many entries use a file (deleted ones too, like `used`), and whether one of the live entries shows it without a description. */
async function usageOf(ctx: QueryCtx, file: Id<'uploads'>) {
  const refs = await entryRefsOf(ctx, file)
  let missingAlt = false
  for (const ref of refs) {
    if (ref.missingAlt !== true) continue
    const id = ctx.db.normalizeId('entries', ref.holderId)
    const entry = id ? await ctx.db.get(id) : null
    // Like the "Missing alt text" view: an image that only a deleted entry shows is nothing to describe.
    if (entry && !entry.deletedAt) {
      missingAlt = true
      break
    }
  }
  return { usedCount: refs.length, missingAlt }
}

async function view(ctx: QueryCtx, row: Doc<'uploads'>) {
  const url = row.status === 'ready' && row.processedId ? await ctx.storage.getUrl(row.processedId) : null
  const usage = await usageOf(ctx, row._id)
  return {
    id: row._id, name: row.name, mime: row.mime, kind: kindOfUpload(row), size: row.size, width: row.width ?? null, height: row.height ?? null,
    url, folder: row.folder ?? null, kept: row.kept === true, focus: row.focus ?? null, sha256: row.sha256 ?? null,
    trashedAt: row.trashedAt ?? null, createdAt: row._creationTime, used: usage.usedCount > 0, usedCount: usage.usedCount, missingAlt: usage.missingAlt,
  }
}

// ---- Views ----

type Read<T> = (after: string | null) => Promise<{ rows: T[]; full: boolean }>

/**
 * Reads steps of at most SCAN rows from `start` until a page of resolved files is full. The cursor
 * names the last row looked at, so a call that filters a lot may return few files and `isDone: false`.
 */
async function walk<T>(start: string | null, read: Read<T>, cursorOf: (row: T) => string, resolve: (row: T) => Promise<Doc<'uploads'> | null>) {
  const out: Doc<'uploads'>[] = []
  const seen = new Set<string>()
  let after = start
  for (let scan = 0; scan < MAX_SCANS; scan++) {
    const { rows, full } = await read(after)
    for (const row of rows) {
      after = cursorOf(row)
      const file = await resolve(row)
      if (!file || seen.has(file._id)) continue
      seen.add(file._id)
      out.push(file)
      if (out.length >= PAGE) return { rows: out, cursor: after, isDone: false }
    }
    if (!full) return { rows: out, cursor: null, isDone: true }
  }
  return { rows: out, cursor: after, isDone: false }
}

/**
 * The files of a site in one view, newest first, 50 per call. `folder`: an id for one folder, null
 * for the top level, absent for every folder. `search`: part of the file name, any case.
 * Pass the returned `cursor` for the next call; `isDone` says nothing is left.
 */
export const list = query({
  args: {
    site: v.string(),
    view: v.union(v.literal('all'), v.literal('recent'), v.literal('unused'), v.literal('missingAlt'), v.literal('duplicates'), v.literal('trash')),
    folder: v.optional(v.union(v.string(), v.null())),
    search: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const site = actor.site._id
    const folder = args.folder === undefined ? undefined : args.folder === null ? null : (await folderOf(ctx, actor, args.folder))._id
    const needle = args.search?.trim().toLowerCase()
    const start = args.cursor ?? null
    const named = (row: Doc<'uploads'>) => !needle || row.name.toLowerCase().includes(needle)
    const live = (row: Doc<'uploads'>) => row.status === 'ready' && !row.trashedAt
    const inFolder = (row: Doc<'uploads'>) => folder === undefined || (row.folder ?? null) === folder
    const byTime = (row: Doc<'uploads'> | Doc<'fileRefs'>) => String(row._creationTime)
    const before = (after: string | null) => (after === null ? undefined : Number(after))

    let result: { rows: Doc<'uploads'>[]; cursor: string | null; isDone: boolean }
    if (args.view === 'duplicates') {
      // Groups of equal hash stay whole, so the cursor is the last hash looked at.
      const rows: Doc<'uploads'>[] = []
      let after = start ?? ''
      let done = false
      for (let i = 0; i < MAX_SCANS * SCAN && rows.length < PAGE; i++) {
        const first = await ctx.db.query('uploads').withIndex('by_site_sha256', (q) => q.eq('site', site).gt('sha256', after)).first()
        if (!first) {
          done = true
          break
        }
        after = first.sha256!
        const group = (await ctx.db.query('uploads').withIndex('by_site_sha256', (q) => q.eq('site', site).eq('sha256', after)).collect()).filter(live)
        if (group.length > 1) rows.push(...group.filter((r) => named(r) && inFolder(r)))
      }
      result = { rows, cursor: done ? null : after, isDone: done }
    } else if (args.view === 'trash') {
      // Newest in the trash first; the cursor is "trashedAt:creation time" because many files can be trashed in one millisecond.
      const [t, c] = (start ?? '').split(':').map(Number)
      const read: Read<Doc<'uploads'>> = async () => {
        const rows = await ctx.db.query('uploads').withIndex('by_site_trashed', (q) => (start === null ? q.eq('site', site).gt('trashedAt', 0) : q.eq('site', site).gt('trashedAt', 0).lte('trashedAt', t!))).order('desc').take(SCAN)
        return { rows: rows.filter((r) => start === null || r.trashedAt! < t! || r._creationTime < c!), full: rows.length === SCAN }
      }
      result = await walk(start, read, (r) => `${r.trashedAt}:${r._creationTime}`, async (r) => (named(r) && inFolder(r) ? r : null))
    } else if (args.view === 'missingAlt') {
      const read: Read<Doc<'fileRefs'>> = async (after) => {
        const rows = await ctx.db.query('fileRefs').withIndex('by_site_missingAlt', (q) => {
          const base = q.eq('site', site).eq('missingAlt', true)
          return after === null ? base : base.lt('_creationTime', before(after)!)
        }).order('desc').take(SCAN)
        return { rows, full: rows.length === SCAN }
      }
      result = await walk(start, read, byTime, async (ref) => {
        const entryId = ctx.db.normalizeId('entries', ref.holderId)
        const entry = entryId ? await ctx.db.get(entryId) : null
        const file = await ctx.db.get(ref.file)
        // An image that only a deleted entry shows is nothing to describe.
        return entry && !entry.deletedAt && file && live(file) && named(file) && inFolder(file) ? file : null
      })
    } else {
      // all, recent, unused: newest first. "all" follows the folder, the others look at every folder (unused respects `folder` when given).
      const byFolder = args.view === 'all' && folder !== undefined
      const read: Read<Doc<'uploads'>> = async (after) => {
        const rows = byFolder
          ? await ctx.db.query('uploads').withIndex('by_site_folder', (q) => {
            const base = q.eq('site', site).eq('folder', folder ?? undefined)
            return after === null ? base : base.lt('_creationTime', before(after)!)
          }).order('desc').take(SCAN)
          : await ctx.db.query('uploads').withIndex('by_site', (q) => {
            const base = q.eq('site', site)
            return after === null ? base : base.lt('_creationTime', before(after)!)
          }).order('desc').take(SCAN)
        return { rows, full: rows.length === SCAN }
      }
      result = await walk(start, read, byTime, async (row) => {
        if (!live(row) || !named(row)) return null
        if (args.view === 'unused') return inFolder(row) && !(await entryRefsOf(ctx, row._id)).length ? row : null
        return args.view === 'recent' || inFolder(row) ? row : null
      })
    }
    return { files: await Promise.all(result.rows.map((row) => view(ctx, row))), cursor: result.cursor, isDone: result.isDone }
  },
})

/** Where a file is used, for the agent door (SPEC 16): the same `usedIn` as `info`, for an actor already known. */
export async function usageAs(ctx: QueryCtx, actor: Actor, file: string) {
  const row = await uploadOf(ctx, actor, file)
  const usedIn = await usedInOf(ctx, actor.site.schema as Schema, await entryRefsOf(ctx, row._id))
  return { file: row._id, name: row.name, usedIn }
}

/**
 * One file in full: its data, URL, focus point, a suggestion for an alt text (the one most recently
 * saved by an entry that shows this file, per language) and every entry that uses it. Deleted entries
 * are listed too, marked `deleted`: they still block the trash until the retention removes them.
 */
export const info = query({
  args: { site: v.string(), file: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const row = await uploadOf(ctx, actor, args.file)
    const schema = actor.site.schema as Schema
    const refs = await entryRefsOf(ctx, row._id)
    const usedIn = await usedInOf(ctx, schema, refs, row.alt)

    let suggestion: { at: number; alt: Record<string, Json> } | null = null
    for (const ref of refs) {
      const id = ctx.db.normalizeId('entries', ref.holderId)
      const entry = id ? await ctx.db.get(id) : null
      if (!entry || entry.deletedAt) continue
      const latest = await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry._id)).order('desc').first()
      const at = latest?.at ?? entry._creationTime
      for (const use of ref.uses ?? []) {
        const alt = (valueAt(entry.data as Data, use.path) as { alt?: Record<string, Json> } | undefined)?.alt
        const filled = Object.fromEntries(Object.entries(alt && typeof alt === 'object' ? alt : {}).filter(([, text]) => typeof text === 'string' && text.trim()))
        if (Object.keys(filled).length && (!suggestion || at > suggestion.at)) suggestion = { at, alt: filled }
      }
    }
    return {
      ...(await view(ctx, row)),
      uploader: row.uploader,
      uploadedBy: await (await labeler(ctx, actor)).who(row.uploader),
      previous: (row.previous ?? []).map((p) => p.replacedAt),
      alt: row.alt ?? {},
      altSuggestion: suggestion?.alt ?? null,
      usedIn,
    }
  },
})

/**
 * The sidebar badge counts of the library: files that a live entry shows without a description in some
 * language of the site (the "Missing alt text" view, counted once per file). Any member may read.
 */
export const counts = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const site = actor.site._id
    const files = new Set<string>()
    // At most COUNT_MAX references are read; a site with more is far beyond what a badge can tell, so the count stops there.
    const refs = await ctx.db.query('fileRefs').withIndex('by_site_missingAlt', (q) => q.eq('site', site).eq('missingAlt', true)).take(COUNT_MAX)
    for (const ref of refs) {
      if (files.has(ref.file)) continue
      const entryId = ctx.db.normalizeId('entries', ref.holderId)
      const entry = entryId ? await ctx.db.get(entryId) : null
      const file = entry && !entry.deletedAt ? await ctx.db.get(ref.file) : null
      if (file && file.status === 'ready' && !file.trashedAt) files.add(file._id)
    }
    return { missingAlt: files.size }
  },
})

/** All folders of the site, flat, with their parent (null at the top level), sorted by name in the site's main language ("Folder 2" before "Folder 10"). */
export const folders = query({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const actor = await actorFor(ctx, args.site)
    const rows = await ctx.db.query('folders').withIndex('by_site_parent', (q) => q.eq('site', actor.site._id)).collect()
    return rows.map((f) => ({ id: f._id, name: f.name, parent: f.parent ?? null })).sort((a, b) => a.name.localeCompare(b.name, (actor.site.schema as Schema).locales[0], { numeric: true }))
  },
})

// ---- Folders ----

/** A folder name: like a file name (no path, no control characters), 1 to 80 characters, unique among its siblings. */
async function checkFolderName(ctx: QueryCtx, site: Id<'sites'>, parent: Id<'folders'> | undefined, raw: string, self?: Id<'folders'>) {
  const given = raw.trim()
  if (!given) fail('INVALID', 'errors.folderNameRequired')
  const name = cleanName(given)
  if (name.length > FOLDER_NAME_MAX) fail('INVALID', 'errors.folderNameTooLong', { folderNameMax: FOLDER_NAME_MAX })
  const siblings = await ctx.db.query('folders').withIndex('by_site_parent', (q) => q.eq('site', site).eq('parent', parent)).collect()
  if (siblings.some((f) => f._id !== self && f.name.toLowerCase() === name.toLowerCase())) fail('INVALID', 'errors.folderNameTaken', { name })
  return name
}

export const createFolder = mutation({
  args: { site: v.string(), name: v.string(), parent: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    const parent = args.parent ? (await folderOf(ctx, actor, args.parent))._id : undefined
    const name = await checkFolderName(ctx, actor.site._id, parent, args.name)
    return ctx.db.insert('folders', { site: actor.site._id, name, ...(parent ? { parent } : {}) })
  },
})

export const renameFolder = mutation({
  args: { site: v.string(), folder: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    const folder = await folderOf(ctx, actor, args.folder)
    await ctx.db.patch(folder._id, { name: await checkFolderName(ctx, actor.site._id, folder.parent, args.name, folder._id) })
    return null
  },
})

/** Moves a folder under another one (null: to the top level). A folder cannot go into itself or into one of its own subfolders. */
export const moveFolder = mutation({
  args: { site: v.string(), folder: v.string(), parent: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    const folder = await folderOf(ctx, actor, args.folder)
    const parent = args.parent === null ? undefined : await folderOf(ctx, actor, args.parent)
    for (let up: Doc<'folders'> | null | undefined = parent; up; up = up.parent ? await ctx.db.get(up.parent) : null) {
      if (up._id === folder._id) fail('INVALID', 'errors.folderCannotNestInSelf')
    }
    await checkFolderName(ctx, actor.site._id, parent?._id, folder.name, folder._id)
    await ctx.db.patch(folder._id, { parent: parent?._id })
    return null
  },
})

/** Deletes a folder only when it is empty: no subfolders and no files, trashed files included. */
export const deleteFolder = mutation({
  args: { site: v.string(), folder: v.string() },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    const folder = await folderOf(ctx, actor, args.folder)
    const child = await ctx.db.query('folders').withIndex('by_site_parent', (q) => q.eq('site', actor.site._id).eq('parent', folder._id)).first()
    const file = await ctx.db.query('uploads').withIndex('by_site_folder', (q) => q.eq('site', actor.site._id).eq('folder', folder._id)).first()
    if (child || file) fail('INVALID', 'errors.folderNotEmpty')
    await ctx.db.delete(folder._id)
    return null
  },
})

// ---- Files ----

/** Moves files into a folder (null: out of all folders). A file in a folder is kept. */
export const move = mutation({
  args: { site: v.string(), files: ids, folder: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    const rows = await uploadsOf(ctx, actor, args.files)
    const folder = args.folder === null ? undefined : await folderOf(ctx, actor, args.folder)
    for (const row of rows) await ctx.db.patch(row._id, { folder: folder?._id, ...(folder ? { kept: true } : {}) })
    return null
  },
})

/** Renames a file. The name goes through the same cleaning as an upload name. */
export const rename = mutation({
  args: { site: v.string(), file: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    const row = await uploadOf(ctx, actor, args.file)
    const given = args.name.trim()
    if (!given || given.length > 200) fail('INVALID', 'errors.fileNameInvalid')
    await ctx.db.patch(row._id, { name: cleanName(given) })
    return null
  },
})

/** Sets (or with null, clears) the focus point of an image: x and y from 0 to 1. */
export const setFocus = mutation({
  args: { site: v.string(), file: v.string(), focus: v.union(v.object({ x: v.number(), y: v.number() }), v.null()) },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    const row = await uploadOf(ctx, actor, args.file)
    if (kindOfUpload(row) !== 'image') fail('INVALID', 'errors.onlyImageHasFocus')
    const { focus } = args
    if (focus && !(focus.x >= 0 && focus.x <= 1 && focus.y >= 0 && focus.y <= 1)) fail('INVALID', 'errors.focusPointOutsideImage')
    await ctx.db.patch(row._id, { focus: focus ?? undefined })
    return null
  },
})

/**
 * Writes the description (alt text) of a photo in one language of the site: the default for every use
 * of the photo that has no text of its own. Empty text removes that language. The "missing alt text"
 * marks of all entries that show the photo are recomputed in the same transaction.
 */
export const setAlt = mutation({
  args: { site: v.string(), file: v.string(), locale: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    const row = await uploadOf(ctx, actor, args.file)
    if (kindOfUpload(row) !== 'image') fail('INVALID', 'errors.onlyImageHasAlt')
    const schema = actor.site.schema as Schema
    if (!schema.locales.includes(args.locale)) fail('INVALID', 'errors.languageNotOnSite', { locale: args.locale })
    const text = args.text.trim()
    if (text.length > ALT_MAX) fail('INVALID', 'errors.altTooLong')
    const alt = { ...(row.alt ?? {}) }
    if (text) alt[args.locale] = text
    else delete alt[args.locale]
    await ctx.db.patch(row._id, { alt: Object.keys(alt).length ? alt : undefined })

    // Holders of kind 'change' keep theirs: they are history, not shown content.
    for (const ref of await entryRefsOf(ctx, row._id)) {
      const id = ctx.db.normalizeId('entries', ref.holderId)
      const entry = id ? await ctx.db.get(id) : null
      const brick = entry && Object.hasOwn(schema.bricks, entry.brick) ? schema.bricks[entry.brick] : undefined
      if (!entry || !brick) continue
      const uses = usesOf(brick.fields, entry.data as Data, schema.locales, uploadIdsOf(ctx), (file) => (file === row._id ? alt : undefined)).get(row._id)
      if (!uses) continue
      const missingAlt = uses.some((u) => u.missingAlt)
      if (!same(ref.uses, uses) || ref.missingAlt !== missingAlt) await ctx.db.patch(ref._id, { uses, missingAlt })
    }
    return null
  },
})

/** Keeps files on purpose: the 7-day sweep of unused uploads leaves them alone. */
export const keep = mutation({
  args: { site: v.string(), files: ids },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    for (const row of await uploadsOf(ctx, actor, args.files)) await ctx.db.patch(row._id, { kept: true })
    return null
  },
})

/**
 * Moves unused files to the trash. A file that any entry uses, a deleted entry included, is not
 * trashed: it comes back in `refused` with the entries that use it. Already trashed files are skipped.
 */
export const trash = mutation({
  args: { site: v.string(), files: ids },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    const schema = actor.site.schema as Schema
    const now = Date.now()
    const trashed: string[] = []
    const refused: { file: string; name: string; usedIn: Awaited<ReturnType<typeof usedInOf>> }[] = []
    for (const row of await uploadsOf(ctx, actor, args.files)) {
      if (row.trashedAt) continue
      const refs = await entryRefsOf(ctx, row._id)
      if (refs.length) {
        refused.push({ file: row._id, name: row.name, usedIn: await usedInOf(ctx, schema, refs) })
        continue
      }
      await ctx.db.patch(row._id, { trashedAt: now })
      trashed.push(row._id)
    }
    return { trashed, refused }
  },
})

/** Takes files out of the trash. */
export const restore = mutation({
  args: { site: v.string(), files: ids },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    const restored: string[] = []
    for (const row of await uploadsOf(ctx, actor, args.files)) {
      if (!row.trashedAt) continue
      await ctx.db.patch(row._id, { trashedAt: undefined })
      restored.push(row._id)
    }
    return { restored }
  },
})

/**
 * Puts a new file in the place of `file`. The new file is first uploaded the usual way (ticket,
 * POST /upload, processing) and arrives here as `upload`, ready and not yet used. It must be the
 * same kind (image for image, PDF for PDF). `file` keeps its ID, so every entry keeps pointing at
 * it; it takes over the new content, name and focus stay as they are (focus is cleared: the picture
 * changed), and the old stored file moves to `previous` for 30 days. The temporary upload row goes.
 * If an entry uses the file, contentRev rises like after a save.
 */
export const replace = mutation({
  args: { site: v.string(), file: v.string(), upload: v.string() },
  handler: async (ctx, args) => {
    const actor = await manager(ctx, args.site)
    const row = await uploadOf(ctx, actor, args.file)
    const fresh = await uploadOf(ctx, actor, args.upload)
    if (row._id === fresh._id) fail('INVALID', 'errors.replacementMustDiffer')
    if (row.trashedAt) fail('INVALID', 'errors.fileInTrash')
    if (row.status !== 'ready') fail('INVALID', 'errors.fileNotReady')
    if (fresh.status !== 'ready' || !fresh.processedId) fail('INVALID', 'errors.newFileNotReady')
    if (kindOfUpload(row) !== kindOfUpload(fresh)) fail('INVALID', row.mime.startsWith('image/') ? 'errors.imageOnlyReplacedByImage' : 'errors.pdfOnlyReplacedByPdf')
    if ((await ctx.db.query('fileRefs').withIndex('by_file', (q) => q.eq('file', fresh._id)).first())) fail('INVALID', 'errors.newFileAlreadyInUse')
    await ctx.db.patch(row._id, {
      storageId: fresh.storageId, processedId: fresh.processedId, variants: fresh.variants, size: fresh.size, mime: fresh.mime,
      width: fresh.width, height: fresh.height, sha256: fresh.sha256, focus: undefined,
      previous: [...(row.previous ?? []), { storageId: row.storageId, ...(row.processedId ? { processedId: row.processedId } : {}), ...(row.variants?.length ? { variants: row.variants } : {}), replacedAt: Date.now() }],
      hasPrevious: true,
    })
    await ctx.db.delete(fresh._id)
    // Bundles carry the file URL: a used file means new content, so sites fetch the new URL before the old file is purged.
    if ((await entryRefsOf(ctx, row._id)).length) await ctx.db.patch(actor.site._id, { contentRev: actor.site.contentRev + 1 })
    return null
  },
})

// ---- Check of the index ----

type Expected = Map<string, { entry: Id<'entries'>; file: string; uses: { path: string; missingAlt: boolean }[] }>

/**
 * Recomputes the file references of every entry of the site from the entries and compares them
 * with the stored rows (the index behind "used in" and the views). Returns the differences:
 * `missing` (an entry uses a file, no row), `extra` (a row without a use), `stale` (uses or
 * missingAlt differ). With `fix: true` it also corrects them. Entries of a brick the schema no
 * longer has are left alone.
 */
export const rebuildRefs = internalMutation({
  args: { site: v.id('sites'), fix: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const site = await ctx.db.get(args.site)
    if (!site) fail('SITE_NOT_FOUND', 'errors.siteNotFound')
    const schema = site.schema as Schema
    const entries = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', args.site)).collect()
    const skip = new Set<string>()
    const expected: Expected = new Map()
    for (const entry of entries) {
      const brick = Object.hasOwn(schema.bricks, entry.brick) ? schema.bricks[entry.brick] : undefined
      if (!brick) {
        skip.add(entry._id)
        continue
      }
      for (const [file, uses] of await entryUses(ctx, brick.fields, entry.data as Data, schema.locales)) expected.set(`${entry._id}\n${file}`, { entry: entry._id, file, uses })
    }
    const rows = await ctx.db.query('fileRefs').withIndex('by_site_holder', (q) => q.eq('site', args.site).eq('holder', 'entry')).collect()
    const found = new Set<string>()
    const extra: { entry: string; file: string }[] = []
    const stale: { entry: string; file: string }[] = []
    for (const row of rows) {
      if (skip.has(row.holderId)) continue
      const key = `${row.holderId}\n${row.file}`
      const want = expected.get(key)
      if (!want || found.has(key)) {
        extra.push({ entry: row.holderId, file: row.file })
        if (args.fix) await ctx.db.delete(row._id)
        continue
      }
      found.add(key)
      const missingAlt = want.uses.some((u) => u.missingAlt)
      if (!same(row.uses, want.uses) || row.missingAlt !== missingAlt) {
        stale.push({ entry: row.holderId, file: row.file })
        if (args.fix) await ctx.db.patch(row._id, { uses: want.uses, missingAlt })
      }
    }
    const missing: { entry: string; file: string }[] = []
    for (const [key, want] of expected) {
      if (found.has(key)) continue
      // An id that is no upload of this site (a leftover in the data) cannot have a row; that is a data problem, not an index one.
      const upload = ctx.db.normalizeId('uploads', want.file)
      if (!upload || (await ctx.db.get(upload))?.site !== args.site) continue
      missing.push({ entry: want.entry, file: want.file })
      if (args.fix) {
        await ctx.db.insert('fileRefs', { site: args.site, file: upload, holder: 'entry', holderId: want.entry, uses: want.uses, missingAlt: want.uses.some((u) => u.missingAlt) })
      }
    }
    return { missing, extra, stale, fixed: args.fix === true }
  },
})

