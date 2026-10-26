// The hard delete of a site (GDPR). `sites.startDeletion` schedules `purge` for 7 days later; it removes every row that
// names the site, the stored files and image variants behind its uploads, and last the site row itself. `purgeNow`
// starts it at once, for operators on a local backend or the demo platform only.
// One run handles a bounded batch per table and schedules itself again until nothing is left.
import { v } from 'convex/values'
import { internal } from './_generated/api'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import { internalMutation } from './_generated/server'
import { fail } from './lib/access'
import { purgeUpload } from './lib/library'

/** Rows per table and run. Entries, changes and proposals carry big documents, so fewer of them fit in one transaction. */
const BATCH = 100
const HEAVY_BATCH = 20
const TREE_BATCH = 5

export const purge = internalMutation({
  args: { site: v.id('sites') },
  handler: async (ctx, args): Promise<null> => {
    const site = await ctx.db.get(args.site)
    // Cancelled (or an old job after a cancel and a new start): nothing to do.
    if (!site?.deleting || site.deleting.at > Date.now()) return null
    const id = args.site
    let more = false
    const sweep = async <T extends { _id: Id<TableNames> }>(cap: number, find: (n: number) => Promise<T[]>, remove?: (row: T) => Promise<void>) => {
      const rows = await find(cap)
      for (const row of rows) await (remove ? remove(row) : ctx.db.delete(row._id))
      if (rows.length === cap) more = true
    }

    await sweep(BATCH, (n) => ctx.db.query('uploads').withIndex('by_site', (q) => q.eq('site', id)).take(n), (row: Doc<'uploads'>) => purgeUpload(ctx, row))
    await sweep(BATCH, (n) => ctx.db.query('fileRefs').withIndex('by_site_holder', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('folders').withIndex('by_site_parent', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('uploadTickets').withIndex('by_site', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('pendingChanges').withIndex('by_site', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('slugs').withIndex('by_key', (q) => q.eq('site', id)).take(n))
    // A part of an entry's trees holds up to about 900 KB.
    await sweep(TREE_BATCH, (n) => ctx.db.query('entryTrees').withIndex('by_site', (q) => q.eq('site', id)).take(n))
    await sweep(HEAVY_BATCH, (n) => ctx.db.query('entries').withIndex('by_site_brick_order', (q) => q.eq('site', id)).take(n))
    await sweep(HEAVY_BATCH, (n) => ctx.db.query('changes').withIndex('by_site_at', (q) => q.eq('site', id)).take(n))
    await sweep(HEAVY_BATCH, (n) => ctx.db.query('proposals').withIndex('by_site', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('releases').withIndex('by_site_status', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('ops').withIndex('by_site_actor_op', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('migrationsApplied').withIndex('by_site_id', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('views').withIndex('by_site_user_brick', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('reminders').withIndex('by_site_brick_week_user', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('rateWindows').withIndex('by_site_kind_window', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('agentKeys').withIndex('by_site_user', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('pushKeys').withIndex('by_site', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('invites').withIndex('by_site', (q) => q.eq('site', id)).take(n))
    await sweep(BATCH, (n) => ctx.db.query('memberships').withIndex('by_site', (q) => q.eq('site', id)).take(n))

    // The site row goes in the same transaction that found every other table empty, so no orphan can follow.
    if (more) await ctx.scheduler.runAfter(0, internal.siteDeletion.purge, { site: id })
    else await ctx.db.delete(id)
    return null
  },
})

/**
 * Operator: deletes a site now instead of in 7 days (`npx convex run siteDeletion:purgeNow '{"slug":"…"}'`). Only on a
 * local backend or the demo platform (GINKO_DEMO=1), whose sites are rebuilt from git; a client's site keeps the 7 days
 * in which its owner can still cancel.
 */
export const purgeNow = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    if (process.env.GINKO_LOCAL !== '1' && process.env.GINKO_DEMO !== '1') fail('FORBIDDEN', 'errors.localOrDemoOnly')
    const site = await ctx.db.query('sites').withIndex('by_slug', (q) => q.eq('slug', args.slug)).unique()
    if (!site) fail('SITE_NOT_FOUND', 'errors.siteMissing')
    if (site.deleting) await ctx.scheduler.cancel(site.deleting.job)
    const job = await ctx.scheduler.runAfter(0, internal.siteDeletion.purge, { site: site._id })
    await ctx.db.patch(site._id, { deleting: { at: Date.now(), job } })
    return { slug: args.slug }
  },
})
