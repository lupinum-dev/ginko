// Bundle reads for the public endpoint (SPEC 6). The HTTP layer lives in routes/bundle.ts;
// the bundle itself is built by the core `servedBundle`, never here.
import { servedBundle, todayIn, type Bundle, type FileInfo, type Json, type Schema, type StoredEntry } from '@lupinum/ginko'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { internalMutation, internalQuery, type QueryCtx } from './_generated/server'

/** SPEC 6: 600 requests per minute and site. */
export const RATE_LIMIT = 600
export const RATE_WINDOW_MS = 60_000

export function windowOf(now: number): number {
  return Math.floor(now / RATE_WINDOW_MS)
}

/**
 * Counts one request in the current minute window. Returns RATE_LIMITED for the 601st.
 * An unknown site is reported without a counter row.
 */
export const admit = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<'OK' | 'SITE_NOT_FOUND' | 'RATE_LIMITED'> => {
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', slug)).unique()
    if (!site) return 'SITE_NOT_FOUND'
    const window = windowOf(Date.now())
    const row = await ctx.db.query('rateWindows').withIndex('by_site_window', (q) => q.eq('site', site._id).eq('window', window)).unique()
    if (row && row.count >= RATE_LIMIT) return 'RATE_LIMITED'
    if (row) await ctx.db.patch(row._id, { count: row.count + 1 })
    else await ctx.db.insert('rateWindows', { site: site._id, window, count: 1 })
    return 'OK'
  },
})

/** Change kinds that alter what the public bundle shows. Scheduling, unpublishing and reordering do not. */
const CONTENT_KINDS = new Set(['create', 'save', 'confirm', 'undo', 'restore', 'publish'])

/**
 * When a live entry last changed for the public: its newest content change (a draft's edits end in
 * its 'publish' change, so they count from the moment they went online). Changes are kept only for
 * a while (retention.ts); an older entry falls back to its creation time.
 */
async function updatedAtOf(ctx: QueryCtx, entry: Doc<'entries'>): Promise<string> {
  const recent = await ctx.db.query('changes').withIndex('by_entry', (q) => q.eq('entry', entry._id)).order('desc').take(10)
  const at = recent.find((change) => CONTENT_KINDS.has(change.kind))?.at ?? entry._creationTime
  return new Date(at).toISOString()
}

/**
 * The bundle of one site and locale. `minRev` is `<schemaRev>.<contentRev>` as numbers;
 * a smaller stored number answers STALE, so a refresh never caches older content.
 */
export const build = internalQuery({
  args: {
    slug: v.string(),
    locale: v.string(),
    minRev: v.optional(v.object({ schemaRev: v.number(), contentRev: v.number() })),
  },
  handler: async (ctx, { slug, locale, minRev }): Promise<Bundle | 'SITE_NOT_FOUND' | 'STALE'> => {
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', slug)).unique()
    if (!site) return 'SITE_NOT_FOUND'
    if (minRev && (site.schemaRev < minRev.schemaRev || site.contentRev < minRev.contentRev)) return 'STALE'
    return bundleOf(ctx, site, locale)
  },
})

/** An entry that is not stored yet, with a temporary id, as the link check sees it. */
export interface NewItem { brick: string; id: string; data: Record<string, Json> }

/** The bundle of a site that is known to exist; the agent door's link check builds one per language with it. */
export async function bundleOf(ctx: QueryCtx, site: Doc<'sites'>, locale: string, overrides?: ReadonlyMap<string, Record<string, Json>>, added: readonly NewItem[] = []): Promise<Bundle> {
  const schema = site.schema as Schema
  // A missing locale parameter (empty string) means the main language, not an unknown locale.
  const requestedLocale = locale === '' ? schema.locales[0]! : locale
  const entries: Record<string, StoredEntry[]> = {}
  for (const key of Object.keys(schema.bricks)) {
    const rows = await ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', site._id).eq('brick', key)).collect()
    // Drafts never leave the platform (SPEC 15); their slugs stay reserved in the slugs table.
    // An override (a save that is about to happen) replaces the stored data and also lets a draft through: the link check reads the state after the write.
    const live = rows.filter((row) => !row.deletedAt && (row.state !== 'draft' || overrides?.has(row._id)))
    const list: StoredEntry[] = await Promise.all(live.map(async (row) => ({ id: row._id, order: row.order, data: overrides?.get(row._id) ?? row.data, prints: row.prints, updatedAt: await updatedAtOf(ctx, row) })))
    // An entry that does not exist yet (a create that is only proposed) joins its collection at the end.
    for (const item of added) {
      if (item.brick === key) list.push({ id: item.id, order: Math.max(0, ...list.map((e) => e.order ?? 0)) + 1, data: item.data, prints: {}, updatedAt: new Date().toISOString() })
    }
    entries[key] = list
  }

  // Files: only ready uploads, with the URL of the processed copy when there is one.
  const files = new Map<string, FileInfo>()
  const uploads = await ctx.db.query('uploads').withIndex('by_site', (q) => q.eq('site', site._id)).collect()
  for (const upload of uploads) {
    if (upload.status !== 'ready') continue
    const url = await ctx.storage.getUrl(upload.processedId ?? upload.storageId)
    if (!url) continue
    const variants: { width: number; url: string }[] = []
    for (const variant of upload.variants ?? []) {
      const variantUrl = await ctx.storage.getUrl(variant.storageId)
      if (variantUrl) variants.push({ width: variant.width, url: variantUrl })
    }
    variants.sort((a, b) => a.width - b.width)
    files.set(upload._id, {
      url, name: upload.name, size: upload.size,
      ...(upload.width !== undefined ? { width: upload.width } : {}),
      ...(upload.height !== undefined ? { height: upload.height } : {}),
      ...(variants.length ? { variants } : {}),
      ...(upload.focus ? { focus: upload.focus } : {}),
      ...(upload.alt && Object.keys(upload.alt).length ? { alt: upload.alt } : {}),
    })
  }

  return servedBundle({
    schema,
    requestedLocale,
    entries,
    files: (id) => files.get(id),
    schemaRev: site.schemaRev,
    contentRev: site.contentRev,
    generatedAt: new Date().toISOString(),
    today: todayIn(schema.timezone),
  })
}
