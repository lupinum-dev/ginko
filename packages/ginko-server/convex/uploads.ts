// Uploads (SPEC 3, 4.3, 12): the rows of files that fields point to, their processing state,
// the read path for members of the site, and the daily sweep. A member gets a one-time ticket
// (prepare); the HTTP route routes/upload.ts redeems it, stores the file and registers it for that
// member and site; uploadsNode.ts checks the content and processes images (Node runtime).
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { sha256 } from '@lupinum/ginko/internal'
import type { Doc } from './_generated/dataModel'
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from './_generated/server'
import { windowOf } from './bundle'
import { actorFor, fail, type Actor } from './lib/access'
import { cleanName } from './lib/files'
import { t, type MessageKey } from './lib/i18n'
import { deleteStorage, isKeptUpload, purgeUpload } from './lib/library'

const DAY = 24 * 60 * 60 * 1000
export const MAX_ATTEMPTS = 3
const RETRY_MS = 30_000

const TICKET_MS = 10 * 60 * 1000
/** Upload tickets per person, site and hour. A busy editor uploads a few dozen files; this bounds what a script or a stolen session stores. */
export const UPLOAD_LIMIT = 200

/** Counts one ticket in the person's current hour on this site, or refuses the one over the limit. Platform admins are not counted, as for invites. */
async function countUpload(ctx: MutationCtx, actor: Actor) {
  if (actor.role === 'admin') return
  const site = actor.site._id
  const user = actor.user.id
  const hour = Math.floor(windowOf(Date.now()) / 60) * 60
  const row = await ctx.db.query('rateWindows').withIndex('by_site_kind_window', (q) => q.eq('site', site).eq('kind', 'upload').eq('window', hour).eq('user', user)).unique()
  if (row && row.count >= UPLOAD_LIMIT) fail('RATE_LIMITED', 'errors.tooManyUploads')
  if (row) await ctx.db.patch(row._id, { count: row.count + 1 })
  else await ctx.db.insert('rateWindows', { site, kind: 'upload', user, window: hour, count: 1 })
}

/** 32 random bytes, base64url without padding. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Step 1 (SPEC 4.3): a member gets a ticket for one upload to this site, valid 10 minutes. The
 * browser sends the file with it to POST /upload; the route stores the file itself, so a stored file
 * belongs to its ticket's member and site from the start and can never be claimed by anyone else.
 */
export const prepare = mutation({
  args: { site: v.string(), folder: v.optional(v.string()), library: v.optional(v.boolean()) },
  handler: async (ctx, { site, folder, library }) => {
    const actor = await actorFor(ctx, site)
    // A folder of another site looks like a missing one (SPEC 4.3).
    const folderId = folder === undefined ? null : ctx.db.normalizeId('folders', folder)
    const row = folderId ? await ctx.db.get(folderId) : null
    if (folder !== undefined && (!row || row.site !== actor.site._id)) fail('NOT_FOUND', 'errors.folderNotFound')
    await countUpload(ctx, actor)
    const ticket = newToken()
    await ctx.db.insert('uploadTickets', {
      tokenHash: sha256(ticket), site: actor.site._id, user: actor.user.id, expiresAt: Date.now() + TICKET_MS,
      ...(row ? { folder: row._id } : {}), ...(library ? { library: true } : {}),
    })
    return { ticket }
  },
})

/** The route's first step: a valid ticket is used up and names the site and member; anything else is null. */
export const redeem = internalMutation({
  args: { ticket: v.string() },
  handler: async (ctx, { ticket }) => {
    const row = await ctx.db.query('uploadTickets').withIndex('by_tokenHash', (q) => q.eq('tokenHash', sha256(ticket))).unique()
    if (!row) return null
    await ctx.db.delete(row._id)
    if (row.expiresAt <= Date.now()) return null
    // The ticket outlives no membership: a member removed since then cannot upload.
    const site = await ctx.db.get(row.site)
    const member = await ctx.db.query('memberships').withIndex('by_user_site', (q) => q.eq('user', row.user).eq('site', row.site)).unique()
    const admin = await ctx.db.query('admins').withIndex('by_user', (q) => q.eq('user', row.user)).unique()
    if (!site || site.deleting || (!member && !admin)) return null
    // A folder deleted since the ticket was made is dropped; the file is still a library file.
    const folder = row.folder && await ctx.db.get(row.folder) ? row.folder : undefined
    return { site: row.site, user: row.user, ...(folder ? { folder } : {}), ...(row.library || row.folder ? { library: true } : {}) }
  },
})

/** Records a file the route stored. It stays `processing` until uploadsNode has checked (and for images processed) it. */
export const register = internalMutation({
  args: {
    site: v.id('sites'), uploader: v.string(), storageId: v.id('_storage'), name: v.string(), size: v.number(), mime: v.string(),
    folder: v.optional(v.id('folders')), library: v.optional(v.boolean()),
  },
  handler: async (ctx, { library, ...args }) => {
    // A long name is shortened by cleanName (extension kept); only a missing one is refused.
    const given = args.name.trim()
    if (!given) fail('INVALID', 'errors.fileNameInvalid')
    // A library upload, or one put straight into a folder, is kept: the 7-day sweep leaves it alone.
    const id = await ctx.db.insert('uploads', { ...args, name: cleanName(given), attempts: 0, status: 'processing', kept: !!(library || args.folder) })
    await ctx.scheduler.runAfter(0, internal.uploadsNode.run, { upload: id })
    return id
  },
})

/**
 * A file that entries already name (an import writes the entries before their files are processed) reaches the site
 * only now: contentRev rises like after a save, so a site's cache fetches the content again.
 */
async function showWhereUsed(ctx: MutationCtx, row: Doc<'uploads'>) {
  const used = await ctx.db.query('fileRefs').withIndex('by_file', (q) => q.eq('file', row._id)).filter((q) => q.eq(q.field('holder'), 'entry')).first()
  const site = used ? await ctx.db.get(row.site) : null
  if (site) await ctx.db.patch(site._id, { contentRev: site.contentRev + 1 })
}

/** A PDF whose content checked out is ready as stored; nothing is processed or removed. Repeats are no-ops. */
export const markFileReady = internalMutation({
  args: { upload: v.id('uploads'), sha256: v.optional(v.string()) },
  handler: async (ctx, { upload, sha256 }) => {
    const row = await ctx.db.get(upload)
    if (!row || row.status !== 'processing') return false
    await ctx.db.patch(upload, { status: 'ready', processedId: row.storageId, ...(sha256 ? { sha256 } : {}) })
    await showWhereUsed(ctx, row)
    return true
  },
})

/** Stores variants made later (backfill). Only while the row still has the same processed file and no variants; otherwise false. */
export const setVariants = internalMutation({
  args: { upload: v.id('uploads'), processedId: v.id('_storage'), variants: v.array(v.object({ width: v.number(), storageId: v.id('_storage') })) },
  handler: async (ctx, { upload, processedId, variants }) => {
    const row = await ctx.db.get(upload)
    if (!row || row.status !== 'ready' || row.processedId !== processedId || row.variants !== undefined) return false
    await ctx.db.patch(upload, { variants })
    return true
  },
})

/** One page of ready image uploads; `todo` are those without variants (never processed for them). */
export const variantsTodo = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), numItems: v.number() },
  handler: async (ctx, { cursor, numItems }) => {
    const page = await ctx.db.query('uploads').withIndex('by_status', (q) => q.eq('status', 'ready')).paginate({ numItems, cursor })
    const todo = page.page.filter((r) => r.mime.startsWith('image/') && r.variants === undefined && r.processedId).map((r) => ({ upload: r._id, processedId: r.processedId! }))
    return { todo, next: page.isDone ? null : page.continueCursor }
  },
})

export const load = internalQuery({
  args: { upload: v.id('uploads') },
  handler: (ctx, { upload }) => ctx.db.get(upload),
})

/** Writes the processed file, its size and dimensions and `ready`, then plans the removal of the original. Repeats are no-ops. */
export const markReady = internalMutation({
  args: {
    upload: v.id('uploads'),
    processedId: v.id('_storage'),
    size: v.number(),
    width: v.number(),
    height: v.number(),
    /** SHA-256 (hex) of the original bytes. */
    sha256: v.optional(v.string()),
    variants: v.optional(v.array(v.object({ width: v.number(), storageId: v.id('_storage') }))),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.upload)
    if (!row || row.status !== 'processing') return false
    await ctx.db.patch(row._id, { processedId: args.processedId, size: args.size, width: args.width, height: args.height, status: 'ready', ...(args.variants ? { variants: args.variants } : {}), ...(args.sha256 ? { sha256: args.sha256 } : {}) })
    await ctx.scheduler.runAfter(0, internal.uploads.dropFile, { storageId: row.storageId })
    await showWhereUsed(ctx, row)
    return true
  },
})

/** Counts a failed attempt. Permanent failures and the third attempt end in `failed`; others retry later. */
export const markFailed = internalMutation({
  args: { upload: v.id('uploads'), key: v.string(), permanent: v.boolean() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.upload)
    if (!row || row.status !== 'processing') return
    const attempts = row.attempts + 1
    if (args.permanent || attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(row._id, { status: 'failed', attempts, error: args.key })
      return
    }
    await ctx.db.patch(row._id, { attempts, error: args.key })
    await ctx.scheduler.runAfter(RETRY_MS * attempts, internal.uploadsNode.run, { upload: row._id })
  },
})

export const dropFile = internalMutation({
  args: { storageId: v.id('_storage') },
  handler: (ctx, { storageId }) => deleteStorage(ctx, storageId),
})

/** Read path for the uploader's site: status and, once ready, the public URL. Other sites get NOT_FOUND. */
export const get = query({
  args: { site: v.string(), upload: v.string() },
  handler: async (ctx, { site, upload }) => {
    const actor = await actorFor(ctx, site)
    const id = ctx.db.normalizeId('uploads', upload)
    const row = id ? await ctx.db.get(id) : null
    if (!row || row.site !== actor.site._id) fail('NOT_FOUND', 'errors.fileNotFound')
    const url = row.status === 'ready' && row.processedId ? await ctx.storage.getUrl(row.processedId) : null
    return { status: row.status, url, name: row.name, mime: row.mime, width: row.width ?? null, height: row.height ?? null,
      // `error` is the catalog key of the reason; `errorText` its German text, for agents and logs.
      error: row.error ?? null, errorText: row.error ? t('de', row.error as MessageKey) : null }
  },
})

/**
 * Read path for fields that show a stored file (a saved image or PDF): the URL of each READY upload
 * of this site. Unknown ids, uploads of another site and uploads that are not ready give null, so
 * a reply never shows whether an id exists elsewhere. A file in the trash says so (`trashed`): a field
 * keeps showing it, but a text may not name it.
 */
export const urls = query({
  args: { site: v.string(), ids: v.array(v.string()) },
  handler: async (ctx, { site, ids }) => {
    const actor = await actorFor(ctx, site)
    // A page shows at most a few dozen files (gallery max 24); a bound keeps one query small.
    if (ids.length > 200) fail('INVALID', 'errors.tooManyFiles')
    const found: Record<string, { url: string; name: string; size: number; width: number | null; height: number | null; alt: Record<string, string>; trashed?: true } | null> = {}
    for (const id of ids) {
      const uploadId = ctx.db.normalizeId('uploads', id)
      const row = uploadId ? await ctx.db.get(uploadId) : null
      const url = row && row.site === actor.site._id && row.status === 'ready' && row.processedId ? await ctx.storage.getUrl(row.processedId) : null
      found[id] = row && url ? { url, name: row.name, size: row.size, width: row.width ?? null, height: row.height ?? null, alt: row.alt ?? {}, ...(row.trashedAt ? { trashed: true as const } : {}) } : null
    }
    return found
  },
})

/**
 * Daily cleanup (SPEC 3, 4.3, 12): storage files without an upload row older than 24 h; uploads
 * that never became ready older than 24 h; ready uploads without a file reference older than 7 days.
 */
const BATCH = 200
const phases = ['storage', 'processing', 'failed', 'ready', 'tickets'] as const

/**
 * Daily cleanup (SPEC 3, 4.3, 12), in batches of 200 that reschedule themselves:
 * - storage: files without an uploads row, created more than 24 h ago. Every older file is
 *   checked, so a missed daily run is caught by the next one.
 * - processing/failed: uploads older than 24 h
 * - ready: uploads older than 7 days without any file reference; kept, foldered and trashed uploads stay
 * - tickets: upload tickets that expired (unused ones; a used ticket is deleted at once)
 */
export const sweep = internalMutation({
  args: { phase: v.optional(v.union(...phases.map((p) => v.literal(p)))), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const now = Date.now()
    const phase = args.phase ?? 'storage'
    const cursor = args.cursor ?? null
    let page
    if (phase === 'storage') {
      page = await ctx.db.system.query('_storage')
        .withIndex('by_creation_time', (q) => q.lt('_creationTime', now - DAY))
        .paginate({ numItems: BATCH, cursor })
      // Storage of replaced files (`previous`) has no row of its own until retention removes it.
      const earlier = new Set<string>()
      for (const row of await ctx.db.query('uploads').withIndex('by_previous', (q) => q.eq('hasPrevious', true)).collect()) {
        for (const old of row.previous ?? []) {
          earlier.add(old.storageId)
          if (old.processedId) earlier.add(old.processedId)
        }
      }
      // Variant copies have no index; the set is built once, and only when a file looks unreferenced.
      let variantIds: Set<string> | undefined
      for (const file of page.page) {
        if (earlier.has(file._id)) continue
        const row = await ctx.db.query('uploads').withIndex('by_storage', (q) => q.eq('storageId', file._id)).first()
          ?? await ctx.db.query('uploads').withIndex('by_processed', (q) => q.eq('processedId', file._id)).first()
        if (row) continue
        if (!variantIds) {
          variantIds = new Set()
          for (const upload of await ctx.db.query('uploads').collect()) {
            for (const variant of upload.variants ?? []) variantIds.add(variant.storageId)
            for (const old of upload.previous ?? []) for (const variant of old.variants ?? []) variantIds.add(variant.storageId)
          }
        }
        if (!variantIds.has(file._id)) await ctx.storage.delete(file._id)
      }
    } else if (phase === 'tickets') {
      page = await ctx.db.query('uploadTickets').withIndex('by_expires', (q) => q.lt('expiresAt', now)).paginate({ numItems: BATCH, cursor })
      for (const ticket of page.page) await ctx.db.delete(ticket._id)
    } else {
      const before = phase === 'ready' ? now - 7 * DAY : now - DAY
      page = await ctx.db.query('uploads').withIndex('by_status', (q) => q.eq('status', phase).lt('_creationTime', before)).paginate({ numItems: BATCH, cursor })
      for (const row of page.page) {
        const referenced = phase === 'ready' && (isKeptUpload(row) || await ctx.db.query('fileRefs').withIndex('by_file', (q) => q.eq('file', row._id)).first())
        if (!referenced) await purgeUpload(ctx, row)
      }
    }
    const next = page.isDone ? phases[phases.indexOf(phase) + 1] : phase
    if (next) await ctx.scheduler.runAfter(0, internal.uploads.sweep, { phase: next, cursor: page.isDone ? null : page.continueCursor })
    return null
  },
})
